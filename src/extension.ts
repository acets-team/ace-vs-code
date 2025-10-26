import { CodeLenses } from './CodeLenses'
import { window, commands, workspace, languages, CodeLens, TextDocument, CodeLensProvider, EventEmitter, ExtensionContext } from 'vscode'



export function activate(context: ExtensionContext) {
  const provider = new AceApiCodeLensProvider() // object contains the actual logic for the code lense VS Code feature

  const providerDisposable = languages.registerCodeLensProvider( // CodeLens Provider
    [{ language: 'typescript' }, { language: 'typescriptreact' }], // tells VS Code when to use the provider (.ts & .tsx files)
    provider
  )

  const commandDisposable = commands.registerCommand( // Custom Command
    'ace-vs-code.openApi',
    async (resolverPath: string) => { // open document
      const doc = await workspace.openTextDocument(resolverPath)
      await window.showTextDocument(doc)
    }
  )

  context.subscriptions.push(providerDisposable, commandDisposable) // both objects are instances of Disposable (have a .dispose()) and both need their respective resources to be disposed when the extension is deactivated which pushing here ensures
}



class AceApiCodeLensProvider implements CodeLensProvider { // defines logic for CodeLens & a CodeLens is information displayed inline with source code
  private _onDidChangeCodeLenses = new EventEmitter<void>()
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event

  async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> { // the main function that VS Code calls whenever it needs to draw the CodeLenses for an active file
    return (await CodeLenses.Build(document))?.value ?? []
  }
}



export function deactivate() { } // when VS Code detects extension deactivation (ex: someone disables it or closes VS Code), the extension host automatically iterates through every disposable in the subscriptions array above and calls its .dispose() method
