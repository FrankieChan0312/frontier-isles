import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { gameEngine } from '../src/engine/game-engine.ts'
import { createCompletedGoldenSetup } from '../src/engine/task-05-golden-fixture.test-helper.ts'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(file)
    return file.endsWith('.ts') && !file.includes('.test') ? [file] : []
  })
}

describe('shared game package architecture', () => {
  it('keeps one authoritative engine and no old source copies', () => {
    expect(existsSync(join(repository, 'src/game'))).toBe(false)
    expect(existsSync(join(repository, 'src/ai'))).toBe(false)
    expect(sourceFiles(join(repository, 'packages/game-core/src')).filter(
      (file) => file.endsWith('/game-engine.ts') || file.endsWith('\\game-engine.ts'),
    )).toHaveLength(1)
  })

  it.each(['game-core', 'game-ai'])('%s contains no browser or outer-layer dependencies', (name) => {
    const sourceRoot = join(repository, 'packages', name, 'src')
    const failures: string[] = []
    for (const file of sourceFiles(sourceRoot)) {
      const text = readFileSync(file, 'utf8')
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
      const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text
          const internal = specifier.startsWith('.')
            && resolve(dirname(file), specifier).startsWith(sourceRoot)
          const coreDependency = name === 'game-ai' && specifier.startsWith('@frontier-isles/game-core/')
          if (!internal && !coreDependency) failures.push(`${relative(repository, file)} imports ${specifier}`)
        }
        if (ts.isCallExpression(node)) {
          const call = node.expression.getText(source)
          if (/^(Math\.random|Date\.now|setTimeout|setInterval|fetch|crypto\.|globalThis\.crypto)/u.test(call)) {
            failures.push(`${relative(repository, file)} calls ${call}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect(failures).toEqual([])
  })

  it('resolves built package exports in Node and preserves detached JSON views', () => {
    expect(import.meta.resolve('@frontier-isles/game-core/engine/game-engine')).toContain('/dist/src/engine/game-engine.js')
    const state = createCompletedGoldenSetup()
    const view = gameEngine.createPlayerView(state, state.playerOrder[0])
    expect(JSON.parse(JSON.stringify(view))).toEqual(view)
    expect(view.publicGame.board).not.toBe(state.board)
    expect(view).not.toHaveProperty('random')
    expect(view.publicGame.bank).not.toHaveProperty('developmentDeck')
    expect(view.opponents.every((opponent) => !('resources' in opponent))).toBe(true)
  })
})
