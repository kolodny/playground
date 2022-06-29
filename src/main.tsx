import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { setupTypeAcquisition } from "@typescript/ata";
import ts from "typescript";

import Editor, { Monaco } from "@monaco-editor/react";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Editor
      language="typescript"
      height="80vh"
      theme="vs-dark"
      onMount={(editor, monaco) => {
        monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
          strict: true,
          noUncheckedIndexedAccess: true,
          target: monaco.languages.typescript.ScriptTarget.ESNext,
          lib: ['es2015', 'dom', 'dom.iterable', 'esnext'],
          moduleResolution:
            monaco.languages.typescript.ModuleResolutionKind.NodeJs,
          module: monaco.languages.typescript.ModuleKind.ESNext,
          allowNonTsExtensions: true,
        });
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
          diagnosticCodesToIgnore: [
            // 1375, // top level await warning
            // 2307, // Cannot find module X or its corresponding type declarations
          ],
        });
        const ata = setupTypeAcquisition({
          projectName: "My ATA Project",
          typescript: ts,
          logger: console,
          delegate: {
            receivedFile: (code: string, _path: string) => {
              console.log('GOT FILE!')
              const path = "file://" + _path;
              monaco.languages.typescript.typescriptDefaults.addExtraLib(
                code,
                path
              );
              const uri = monaco.Uri.file(path);
              if (monaco.editor.getModel(uri) === null) {
                monaco.editor.createModel(code, "javascript", uri);
              }
            },
            started: () => {
              console.log("ATA start");
            },
            progress: (downloaded: number, total: number) => {
              console.log(`Got ${downloaded} out of ${total}`);
            },
            finished: (vfs) => {
              console.log("ATA done");
            },
          },
        });

        editor.getModel()?.onDidChangeContent(() => {
          ata(editor.getValue());
        });
      }}
    />
  </React.StrictMode>
);
