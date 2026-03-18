export function detectCycleEdges(adjacency: Map<string, Set<string>>): Set<string> {
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const stack: string[] = []
  const cycleEdges = new Set<string>()

  function dfs(node: string): void {
    visited.add(node)
    inStack.add(node)
    stack.push(node)

    for (const neighbor of adjacency.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor)
        continue
      }

      if (!inStack.has(neighbor)) continue

      const startIndex = stack.indexOf(neighbor)
      if (startIndex >= 0) {
        for (let i = startIndex; i < stack.length - 1; i++) {
          cycleEdges.add(`${stack[i]}->${stack[i + 1]}`)
        }
      }
      cycleEdges.add(`${node}->${neighbor}`)
    }

    stack.pop()
    inStack.delete(node)
  }

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) dfs(node)
  }

  return cycleEdges
}
