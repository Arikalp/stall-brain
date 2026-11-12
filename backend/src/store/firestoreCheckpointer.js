import {
  BaseCheckpointSaver,
  compareWritesSortKeys,
  getCheckpointId,
  writesSortKey,
} from '@langchain/langgraph-checkpoint'

/**
 * Firestore-backed checkpointer (T1.9): runs survive server restarts, so a
 * pending vendor approval is not lost mid-interrupt in production.
 *
 * Storage layout (both collections keyed by thread):
 *   checkpoints/{threadId:ns:checkpointId}
 *   checkpoint_writes/{threadId:ns:checkpointId:taskId:idx}
 *
 * Serialized values are persisted as { type, data } where data is the
 * serde-produced bytes in base64 (string fields keep the fake/test Firestore
 * trivial and work with the real admin SDK unchanged).
 */

function encodeBytes(bytes) {
  return Buffer.from(bytes).toString('base64')
}

function decodeBytes(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

function checkpointDocId(threadId, checkpointNs, checkpointId) {
  return `${threadId}:${checkpointNs}:${checkpointId}`
}

export class FirestoreCheckpointSaver extends BaseCheckpointSaver {
  constructor({ db, serde } = {}) {
    super(serde)
    this.db = db // Firestore adapter (real admin Firestore or a test fake)
  }

  async getTuple(config) {
    const threadId = config.configurable?.thread_id
    if (!threadId) return undefined
    const checkpointNs = config.configurable?.checkpoint_ns ?? ''
    const checkpointId = getCheckpointId(config)

    let doc
    if (checkpointId) {
      doc = await this.db.getDoc(
        'checkpoints',
        checkpointDocId(threadId, checkpointNs, checkpointId),
      )
      if (!doc) return undefined
    } else {
      const docs = await this.db.query('checkpoints', {
        where: ['threadId', threadId],
        orderBy: ['seq', 'desc'],
        limit: 1,
      })
      doc = docs[0]
      if (!doc) return undefined
    }

    const checkpoint = await this.serde.loadsTyped(
      doc.checkpointType,
      decodeBytes(doc.checkpointData),
    )
    const metadata = await this.serde.loadsTyped(
      doc.metadataType,
      decodeBytes(doc.metadataData),
    )
    const pendingWrites = await this.getPendingWrites(
      threadId,
      checkpointNs,
      doc.checkpointId,
    )

    const tuple = {
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: doc.checkpointId,
        },
      },
      checkpoint,
      metadata,
      pendingWrites,
    }
    if (doc.parentCheckpointId) {
      tuple.parentConfig = {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: doc.parentCheckpointId,
        },
      }
    }
    return tuple
  }

  /** Pending writes for one checkpoint, in writesSortKey order. */
  async getPendingWrites(threadId, checkpointNs, checkpointId) {
    const docs = await this.db.query('checkpoint_writes', {
      where: ['key', checkpointDocId(threadId, checkpointNs, checkpointId)],
      orderBy: ['seq', 'desc'],
    })

    const ordered = docs
      .map((doc) => ({
        key: writesSortKey(doc.taskPath ?? '', doc.taskId, doc.idx),
        entry: doc,
      }))
      .sort((a, b) => compareWritesSortKeys(a.key, b.key))
      .map(({ entry }) => entry)

    return Promise.all(
      ordered.map(async (doc) => [
        doc.taskId,
        doc.channel,
        await this.serde.loadsTyped(doc.valueType, decodeBytes(doc.valueData)),
      ]),
    )
  }

  async *list(config, options = {}) {
    const threadId = config.configurable?.thread_id
    if (!threadId) return
    const { limit } = options

    const docs = await this.db.query('checkpoints', {
      where: ['threadId', threadId],
      orderBy: ['seq', 'desc'],
      ...(limit != null ? { limit } : {}),
    })

    for (const doc of docs) {
      const checkpoint = await this.serde.loadsTyped(
        doc.checkpointType,
        decodeBytes(doc.checkpointData),
      )
      const metadata = await this.serde.loadsTyped(
        doc.metadataType,
        decodeBytes(doc.metadataData),
      )
      const pendingWrites = await this.getPendingWrites(
        threadId,
        doc.checkpointNs ?? '',
        doc.checkpointId,
      )
      const tuple = {
        config: {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: doc.checkpointNs ?? '',
            checkpoint_id: doc.checkpointId,
          },
        },
        checkpoint,
        metadata,
        pendingWrites,
      }
      if (doc.parentCheckpointId) {
        tuple.parentConfig = {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: doc.checkpointNs ?? '',
            checkpoint_id: doc.parentCheckpointId,
          },
        }
      }
      yield tuple
    }
  }

  /** Monotonic seq for stable ordering, from the adapter when it provides one. */
  _seq() {
    return this.db._nextSeq?.() ?? Date.now()
  }

  async put(config, checkpoint, metadata) {
    const threadId = config.configurable?.thread_id
    if (!threadId) {
      throw new Error(
        'Failed to put checkpoint: missing thread_id in configurable.',
      )
    }
    const checkpointNs = config.configurable?.checkpoint_ns ?? ''

    const [[checkpointType, checkpointBytes], [metadataType, metadataBytes]] =
      await Promise.all([
        this.serde.dumpsTyped(checkpoint),
        this.serde.dumpsTyped(metadata),
      ])

    const docId = checkpointDocId(threadId, checkpointNs, checkpoint.id)
    await this.db.setDoc('checkpoints', docId, {
      threadId,
      checkpointNs,
      checkpointId: checkpoint.id,
      parentCheckpointId: config.configurable?.checkpoint_id ?? null,
      checkpointType,
      checkpointData: encodeBytes(checkpointBytes),
      metadataType,
      metadataData: encodeBytes(metadataBytes),
      seq: this._seq(),
    })

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpoint.id,
      },
    }
  }

  async putWrites(config, writes, taskId, taskPath) {
    const threadId = config.configurable?.thread_id
    if (!threadId) {
      throw new Error('Failed to put writes: missing thread_id in configurable.')
    }
    const checkpointNs = config.configurable?.checkpoint_ns ?? ''
    const checkpointId = getCheckpointId(config)
    if (!checkpointId) {
      throw new Error('Failed to put writes: missing checkpoint_id in configurable.')
    }

    await Promise.all(
      writes.map(async (write, idx) => {
        const [valueType, valueBytes] = await this.serde.dumpsTyped(write[1])
        await this.db.setDoc(
          'checkpoint_writes',
          `${checkpointDocId(threadId, checkpointNs, checkpointId)}:${taskId}:${idx}`,
          {
            key: checkpointDocId(threadId, checkpointNs, checkpointId),
            threadId,
            checkpointNs,
            checkpointId,
            taskId,
            idx,
            taskPath: taskPath ?? '',
            channel: write[0],
            valueType,
            valueData: encodeBytes(valueBytes),
            seq: this._seq(),
          },
        )
      }),
    )
  }

  async deleteThread(threadId) {
    await this.db.deleteWhere('checkpoints', { where: ['threadId', threadId] })
    await this.db.deleteWhere('checkpoint_writes', {
      where: ['threadId', threadId],
    })
  }
}

/**
 * Dev/test fake of raw Firestore style, used by store tests:
 *   collection.doc(id).set(data) / .get() / .delete() / .collection(sub)
 *   collection.where(field, '==', value) [ .orderBy(field, dir) ] [ .limit(n) ] .get()
 *
 * Plain JS Map-backed, synchronous queries - enough for unit tests.
 */
export class InMemoryFirestore {
  constructor() {
    this.collections = new Map() // "path/to/collection" -> Map(id -> data)
  }

  _docs(...parts) {
    const key = parts.join('/')
    if (!this.collections.has(key)) this.collections.set(key, new Map())
    return this.collections.get(key)
  }

  _collection(docs, pathParts) {
    const snapshot = (entries) => ({
      docs: entries.map(([id, data]) => ({ id, data: () => data })),
    })

    const chainFrom = (entries) => ({
      orderBy: (field, direction = 'asc') => {
        const sorted = [...entries].sort((a, b) =>
          direction === 'desc'
            ? b[1][field] - a[1][field]
            : a[1][field] - b[1][field],
        )
        return chainFrom(sorted)
      },
      limit: (n) => ({
        get: async () => snapshot(entries.slice(0, n)),
      }),
      get: async () => snapshot(entries),
    })

    const colPath = pathParts.join('/')
    return {
      doc: (id) => ({
        set: async (data) => {
          docs.set(id, { ...data })
        },
        get: async () => ({
          exists: docs.has(id),
          data: () => docs.get(id),
        }),
        delete: async () => {
          docs.delete(id)
        },
        // Subcollections: vendors/{id}/logs, vendors/{id}/runs, ...
        collection: (sub) =>
          this._collection(this._docs(colPath, id, sub), [...pathParts, id, sub]),
      }),
      where: (field, op, value) => {
        if (op !== '==') throw new Error('fake only supports ==')
        return chainFrom(
          [...docs.entries()].filter(([, data]) => data[field] === value),
        )
      },
      ...chainFrom([...docs.entries()]),
    }
  }

  collection(name) {
    return this._collection(this._docs(name), [name])
  }
}

/**
 * Test fake of the adapter API the FirestoreCheckpointSaver talks to
 * (mirrors the real adapter built on firebase-admin in production):
 *   setDoc(collection, id, data)
 *   getDoc(collection, id) -> data | null
 *   query(collection, { where: [field, value], orderBy: [field, dir], limit })
 *   deleteWhere(collection, { where: [field, value] })
 *
 * `seq` is a monotonic counter so "latest checkpoint" queries are stable
 * even when puts land in the same millisecond.
 */
export class FakeDbAdapter {
  constructor() {
    this.docs = new Map() // "collection/id" -> data
    this._seq = 0
  }

  async setDoc(collectionName, id, data) {
    this.docs.set(`${collectionName}/${id}`, { ...data })
  }

  async getDoc(collectionName, id) {
    return this.docs.get(`${collectionName}/${id}`) ?? null
  }

  async query(collectionName, { where, orderBy, limit } = {}) {
    let results = []
    for (const [key, data] of this.docs) {
      if (!key.startsWith(`${collectionName}/`)) continue
      results.push({ id: key.slice(collectionName.length + 1), ...data })
    }
    if (where) {
      const [field, value] = where
      results = results.filter((doc) => doc[field] === value)
    }
    if (orderBy) {
      const [field, direction = 'asc'] = orderBy
      results.sort((a, b) =>
        direction === 'desc' ? b[field] - a[field] : a[field] - b[field],
      )
    }
    if (limit != null) results = results.slice(0, limit)
    return results
  }

  async deleteWhere(collectionName, { where } = {}) {
    const [field, value] = where
    for (const key of [...this.docs.keys()]) {
      if (!key.startsWith(`${collectionName}/`)) continue
      if (this.docs.get(key)[field] === value) this.docs.delete(key)
    }
  }

  _nextSeq() {
    return ++this._seq
  }
}

/** Builds the checkpointer named by config (memory in dev, Firestore in prod).
 *  `db` is the Firestore adapter from getDb() (injectable for tests). */
export function createCheckpointer(config, { db } = {}) {
  if (config.checkpointBackend === 'firestore') {
    return new FirestoreCheckpointSaver({ db })
  }
  return null // caller falls back to MemorySaver
}
