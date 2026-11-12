import { getForecastGraph } from '../src/graph/build.js'

const mermaid = getForecastGraph().getGraph().drawMermaid()
console.log(mermaid)
