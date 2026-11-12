import {
  Annotation,
  Command,
  END,
  interrupt,
  MemorySaver,
  START,
  StateGraph,
} from '@langchain/langgraph'

const State = Annotation.Root({
  x: Annotation({ reducer: (_a, b) => b ?? _a, default: () => 0 }),
  decided: Annotation(),
})

const graph = new StateGraph(State)
  .addNode('ask', async (state) => {
    const answer = interrupt({ question: 'approve?', plan: state.x })
    return { decided: answer }
  })
  .addEdge(START, 'ask')
  .addEdge('ask', END)
  .compile({ checkpointer: new MemorySaver() })

const r1 = await graph.invoke({ x: 7 }, { configurable: { thread_id: 't1' } })
console.log('INVOKE-INTERRUPTED:', JSON.stringify(r1, null, 2))

const r2 = await graph.invoke(new Command({ resume: 'yes' }), {
  configurable: { thread_id: 't1' },
})
console.log('INVOKE-RESUMED:', JSON.stringify(r2, null, 2))

// streaming shape at the interrupt
const stream = await graph.stream(
  { x: 9 },
  { streamMode: ['updates', 'custom'], configurable: { thread_id: 't2' } },
)
for await (const chunk of stream) {
  console.log('STREAM-CHUNK:', JSON.stringify(chunk))
}
