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
    regex: FileMeta
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

    const regex: any = {
      path: join(CodeLenses.workspaceRoot, '.ace/fundamentals/regexApiNames.ts')
    }

    const loaders: any = {
      path: join(CodeLenses.workspaceRoot, '.ace/fundamentals/apiLoaders.ts')
    }

    const [apisExists, loadersExists] = await Promise.all([
      exists(regex.path),
      exists(loaders.path)
    ])

    if (!apisExists || !loadersExists) return null

    regex.exists = apisExists
    loaders.exists = loadersExists

    const [apisStats, loadersStats] = await Promise.all([
      stat(regex.path),
      stat(loaders.path)
    ])

    regex.stats = apisStats
    loaders.stats = loadersStats

    CodeLenses.files = { regex, loaders }

    if (!CodeLenses.apiName2Path.size || regex.stats.mtimeMs !== CodeLenses.lastApisMtime || loaders.stats.mtimeMs !== CodeLenses.lastLoadersMtime) { // IF no apiName2Path OR @ace/apis changed OR @ace/loaders changed THEN rebuild apiName2Path
      await CodeLenses.setApiName2Path() // depends on CodeLenses.files = { apis, loaders }
    }

    if (!CodeLenses.apiName2Path.size) return null


    return new CodeLenses(document)
  }


  static async setApiName2Path() {
    if (!CodeLenses.workspaceRoot) return

    const regexApiNamesPath = join(CodeLenses.workspaceRoot, '.ace/fundamentals/regexApiNames.ts')
    const existsRegex = await exists(regexApiNamesPath)
    if (!existsRegex) return

    const stats = await stat(regexApiNamesPath)
    CodeLenses.lastApisMtime = stats.mtimeMs

    const text = await readFile(regexApiNamesPath, 'utf8')

    // Example match:
    // 'apiGetFinances': {
    //   path: '/api/get-finances',
    //   method: 'GET',
    //   pattern: /^\/api\/get-finances\/?$/,
    //   loader: apiLoaders.apiGetFinancesLoader,
    // },
    //
    // We want -> apiName = apiGetFinances, loaderName = apiGetFinancesLoader

    const apiRegex = /['"](?<apiName>\w+)['"]\s*:\s*\{[\s\S]*?loader:\s*apiLoaders\.(?<loaderName>\w+)/g
    const apiLoaderMatches = [...text.matchAll(apiRegex)]

    if (!apiLoaderMatches.length) return

    const apiNameToLoader: Record<string, string> = {}

    for (const m of apiLoaderMatches) {
      if (m.groups?.apiName && m.groups?.loaderName) {
        apiNameToLoader[m.groups.apiName] = m.groups.loaderName
      }
    }

    const apiLoadersPath = join(CodeLenses.workspaceRoot, '.ace/fundamentals/apiLoaders.ts')
    const loadersText = await readFile(apiLoadersPath, 'utf8')

    // Extract loader name -> import path
    const loaderRegex = /export\s+async\s+function\s+(?<loaderName>\w+)\s*\([^)]*\)\s*{[\s\S]*?import\(["'](?<importPath>\.\.\/\.\.\/src\/api\/[^"']+)["']\)/g

    const loaderFilePath = apiLoadersPath
    const loaderToPath: Record<string, string> = {}

    for (const m of loadersText.matchAll(loaderRegex)) {
      const { loaderName, importPath } = m.groups ?? {}

      if (loaderName && importPath) {
        loaderToPath[loaderName] = resolve(dirname(loaderFilePath), importPath + '.ts')
      }
    }

    // Build final apiName -> absolutePath map
    CodeLenses.apiName2Path = new Map()

    for (const [apiName, loaderName] of Object.entries(apiNameToLoader)) {
      const absPath = loaderToPath[loaderName]

      if (absPath) {
        CodeLenses.apiName2Path.set(apiName, absPath)
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
