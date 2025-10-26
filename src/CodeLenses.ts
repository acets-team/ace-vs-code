import type { Stats } from 'fs'
import { join, resolve, dirname } from 'path'
import { stat, access, readFile } from 'fs/promises'
import { workspace, Range, CodeLens, TextDocument } from 'vscode'



export class CodeLenses {
  static lastApisMtime = 0
  static lastLoadersMtime = 0
  static apiName2Path: Map<string, string> = new Map()
  static workspaceRoot = workspace.workspaceFolders?.[0].uri.fsPath
  static files: {
    apis: FileMeta
    loaders: FileMeta
  }

  value: CodeLens[]
  #documentText: string
  #document: TextDocument

  private constructor(document: TextDocument) {
    this.#document = document
    this.#documentText = document.getText()
    this.value = this.#getValue(this.#getImports())
  }


  static async Build(document: TextDocument): Promise<null | CodeLenses> {
    if (!CodeLenses.workspaceRoot) return null

    const apis: any = {
      path: join(CodeLenses.workspaceRoot, '.ace/fundamentals/apis.ts')
    }

    const loaders: any = {
      path: join(CodeLenses.workspaceRoot, '.ace/fundamentals/apiLoaders.ts')
    }

    const [apisExists, loadersExists] = await Promise.all([
      exists(apis.path),
      exists(loaders.path)
    ])

    if (!apisExists || !loadersExists) return null

    apis.exists = apisExists
    loaders.exists = loadersExists

    const [apisStats, loadersStats] = await Promise.all([
      stat(apis.path),
      stat(loaders.path)
    ])

    apis.stats = apisStats
    loaders.stats = loadersStats

    CodeLenses.files = { apis, loaders }

    if (!CodeLenses.apiName2Path.size || apis.stats.mtimeMs !== CodeLenses.lastApisMtime || loaders.stats.mtimeMs !== CodeLenses.lastLoadersMtime) { // IF no apiName2Path OR @ace/apis changed OR @ace/loaders changed THEN rebuild apiName2Path
      await CodeLenses.setApiName2Path() // depends on CodeLenses.files = { apis, loaders }
    }

    if (!CodeLenses.apiName2Path.size) return null


    return new CodeLenses(document)
  }


  static async setApiName2Path() {
    if (!CodeLenses.workspaceRoot) return

    CodeLenses.lastApisMtime = CodeLenses.files.apis.stats.mtimeMs
    CodeLenses.lastLoadersMtime = CodeLenses.files.loaders.stats.mtimeMs

    const [apisText, loadersText] = await Promise.all([
      readFile(CodeLenses.files.apis.path, 'utf8'),
      readFile(CodeLenses.files.loaders.path, 'utf8')
    ])

    // map API function -> loader
    const apiToLoaderMap: Record<string, string> = {}
    const apiRegex = /export\s+const\s+(\w+)\s*=\s*createApiFn\([^,]+,[^,]+,[^,]+,\s*apiLoaders\.(\w+)\)/g

    for (const match of apisText.matchAll(apiRegex)) {
      const [, apiName, loaderName] = match
      apiToLoaderMap[apiName] = loaderName
    }

    const loaderRegex = /export\s+async\s+function\s+(\w+)\s*\([^)]*\)\s*{[\s\S]*?import\(["'](\.\.\/\.\.\/src\/api\/[^"']+)["']\)/g
    const loaderFilePath = join(CodeLenses.workspaceRoot, '.ace/fundamentals/apiLoaders.ts')

    CodeLenses.apiName2Path = new Map()


    for (const match of loadersText.matchAll(loaderRegex)) {
      const [, loaderName, importPath] = match
      const absolutePath = resolve(dirname(loaderFilePath), importPath + '.ts')

      for (const [apiName, name] of Object.entries(apiToLoaderMap)) {
        if (name === loaderName) {
          CodeLenses.apiName2Path.set(apiName, absolutePath)
        }
      }
    }
  }


  #getImports() { // import { collect all imports here & put into an array w/ their original name and any alias defined here } from @ace/apis
    const imports: Imports = []

    const importsRegex = /import\s+\{([^}]+)\}\s+from\s+['"]@ace\/apis['"]/g

    const matches = this.#documentText.matchAll(importsRegex)

    for (const match of matches) {
      const names = match[1].split(',').map(s => s.trim())

      for (const n of names) {
        const [name, alias] = n.split(/\s+as\s+/).map(s => s.trim())
        imports.push({ name, alias: alias || name })
      }
    }

    return imports
  }


  #getValue(imports: Imports): CodeLens[] {
    const results = []

    for (const { name, alias } of imports) {
      const regex = new RegExp(`\\b${alias}\\s*\\(`, 'g')

      for (const match of this.#documentText.matchAll(regex)) {
        const line = Math.max(0, this.#document.positionAt(match.index!).line) // CodeLens above call
        const range = new Range(line, 0, line, 0)
        const resolverPath = CodeLenses.apiName2Path.get(name)

        if (resolverPath) {
          results.push(
            new CodeLens(range, {
              title: '🔗 API', // text that shows as link
              command: 'ace-vs-code.openApi', // the action to perform when the user clicks the link
              arguments: [resolverPath] // The data (path to file) that is passed to the command handler
            })
          )
        }
      }
    }

    return results
  }
}



async function exists(file: string) { // does a file exist
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}


type Imports = {
  name: string
  alias: string
}[]


type FileMeta = {
  path: string
  exists: boolean
  stats: Stats
}
