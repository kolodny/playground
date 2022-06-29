import type { TypeScriptWorker } from "./tsWorker";
import { getDefaultSandboxCompilerOptions } from "./compilerOptions";
import { setupTypeAcquisition } from "@typescript/ata";

type CompilerOptions =
  import("monaco-editor").languages.typescript.CompilerOptions;
type Monaco = typeof import("monaco-editor");

/**
 * These are settings for the playground which are the equivalent to props in React
 * any changes to it should require a new setup of the playground
 */
export type SandboxConfig = {
  /** The default source code for the playground */
  text: string;
  /** Compiler options which are automatically just forwarded on */
  compilerOptions: CompilerOptions;
  /** Optional monaco settings overrides */
  monacoSettings?: import("monaco-editor").editor.IEditorOptions;
} & (
  | { /** the ID of a dom node to add monaco to */ domID: string }
  | { /** the dom node to add monaco to */ elementToAppend: HTMLElement }
);

/** Default Monaco settings for playground */
const sharedEditorOptions: import("monaco-editor").editor.IEditorOptions = {
  scrollBeyondLastLine: true,
  scrollBeyondLastColumn: 3,
  minimap: {
    enabled: false,
  },
  lightbulb: {
    enabled: true,
  },
  inlayHints: {
    enabled: true,
  },
};

/** The default settings which we apply a partial over */
export function defaultPlaygroundSettings() {
  const config: SandboxConfig = {
    text: "",
    domID: "",
    compilerOptions: {},
  };
  return config;
}

/** Creates a sandbox editor, and returns a set of useful functions and the editor */
export const createTypeScriptSandbox = (
  partialConfig: Partial<SandboxConfig>,
  monaco: Monaco,
  ts: typeof import("typescript")
) => {
  const config = { ...(partialConfig as SandboxConfig) };
  if (!("domID" in config) && !("elementToAppend" in config))
    throw new Error("You did not provide a domID or elementToAppend");

  const defaultText = config.text;

  // console.log(config);

  // Defaults
  // const compilerDefaults = getDefaultSandboxCompilerOptions(config, monaco);
  const compilerDefaults = {
    alwaysStrict: true,
    downlevelIteration: false,
    declaration: true,
    emitDecoratorMetadata: true,
    esModuleInterop: true, // import react
    experimentalDecorators: true,
    importHelpers: false,
    jsx: 2,
    module: 99, // top level await
    moduleResolution: 2,
    noEmitHelpers: true,
    noImplicitAny: true,
    noImplicitReturns: true,
    noImplicitThis: true,
    noLib: false,
    noStrictGenericChecks: false,
    noUncheckedIndexedAccess: false,
    noUnusedLocals: false,
    noUnusedParameters: false,
    preserveConstEnums: false,
    removeComments: false,
    skipLibCheck: false,
    strict: true,
    strictBindCallApply: true,
    strictFunctionTypes: true,
    strictNullChecks: true,
    strictPropertyInitialization: true,
    target: 4,
    useDefineForClassFields: false,
  };
  
  // Grab the compiler flags via the query params
  let compilerOptions: CompilerOptions;

  compilerOptions = compilerDefaults;

  const language = "typescript";
  const filePath = monaco.Uri.file("input.tsx");
  const element =
    "domID" in config
      ? document.getElementById(config.domID)
      : (config as any).elementToAppend;

  const model = monaco.editor.createModel(defaultText, language, filePath);

  const monacoSettings = Object.assign(
    { model },
    sharedEditorOptions,
    config.monacoSettings || {}
  );
  const editor = monaco.editor.create(element, monacoSettings);

  const getWorker = monaco.languages.typescript.getTypeScriptWorker;

  const defaults = monaco.languages.typescript.typescriptDefaults;

  // In the future it'd be good to add support for an 'add many files'
  const addLibraryToRuntime = (code: string, _path: string) => {
    const path = "file://" + _path;
    defaults.addExtraLib(code, path);
    const uri = monaco.Uri.file(path);
    if (monaco.editor.getModel(uri) === null) {
      monaco.editor.createModel(code, "javascript", uri);
    }
  };

  const ata = setupTypeAcquisition({
    projectName: "TypeScript Playground",
    typescript: ts,

    fetcher(input, init?) {
      const file = input.toString();
      // console.log({file});
      return fetch(file, init);
    },
    delegate: {
      receivedFile: addLibraryToRuntime,
      progress: (downloaded: number, total: number) => {
        // console.log({ dl, ttl })
      },
      started: () => {
        console.log("ATA start");
      },
      finished: (f) => {
        console.log("ATA done");
      },
    },
  });

  const textUpdated = () => {
    const code = editor.getModel()!.getValue();

    (window as any).go = () => ata(code);
  };

  // Debounced sandbox features like twoslash and type acquisition to once every second
  let debouncingTimer = false;
  editor.onDidChangeModelContent((_e) => {
    if (debouncingTimer) return;
    debouncingTimer = true;
    setTimeout(() => {
      debouncingTimer = false;
      textUpdated();
    }, 1000);
  });

  defaults.setCompilerOptions(compilerOptions);

  /** Gets the results of compiling your editor's code */
  const getEmitResult = async () => {
    const model = editor.getModel()!;
    const client = await getWorkerProcess();
    return await client.getEmitOutput(model.uri.toString());
  };

  /** Gets the JS  of compiling your editor's code */
  const getRunnableJS = async () => {
    // This isn't quite _right_ in theory, we can downlevel JS -> JS
    // but a browser is basically always esnext-y and setting allowJs and
    // checkJs does not actually give the downlevel'd .js file in the output
    // later down the line.

    const result = await getEmitResult();
    const firstJS = result.outputFiles.find(
      (o: any) => o.name.endsWith(".js") || o.name.endsWith(".jsx")
    );
    return (firstJS && firstJS.text) || "";
  };

  /** Gets the DTS for the JS/TS  of compiling your editor's code */
  const getDTSForCode = async () => {
    const result = await getEmitResult();
    return result.outputFiles.find((o: any) => o.name.endsWith(".d.ts"))!.text;
  };

  const getWorkerProcess = async (): Promise<TypeScriptWorker> => {
    const worker = await getWorker();
    // @ts-ignore
    return await worker(model.uri);
  };

  const getDomNode = () => editor.getDomNode()!;
  const getModel = () => editor.getModel()!;
  const getText = () => getModel().getValue();
  const setText = (text: string) => getModel().setValue(text);

  textUpdated();

  return {
    /** The same config you passed in */
    config,
    /** The monaco editor instance */
    editor,
    /** Either "typescript" or "javascript" depending on your config */
    language,
    /** The outer monaco module, the result of require("monaco-editor")  */
    monaco,
    /** Gets a monaco-typescript worker, this will give you access to a language server. Note: prefer this for language server work because it happens on a webworker . */
    getWorkerProcess,
    /** Get all the different emitted files after TypeScript is run */
    getEmitResult,
    /** Gets just the JavaScript for your sandbox, will transpile if in TS only */
    getRunnableJS,
    /** Gets the DTS output of the main code in the editor */
    getDTSForCode,
    /** The monaco-editor dom node, used for showing/hiding the editor */
    getDomNode,
    /** The model is an object which monaco uses to keep track of text in the editor. Use this to directly modify the text in the editor */
    getModel,
    /** Gets the text of the main model, which is the text in the editor */
    getText,
    /** Shortcut for setting the model's text content which would update the editor */
    setText,
    /** Uses the above call setupTSVFS, but only returns the program */
    compilerDefaults,
    /** Adds a file to the vfs used by the editor */
    addLibraryToRuntime,
  };
};

export type Sandbox = ReturnType<typeof createTypeScriptSandbox>;
