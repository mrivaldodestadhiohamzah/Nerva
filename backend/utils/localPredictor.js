import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { backendRootDir, projectRootDir } from "./env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const predictorScript = path.join(__dirname, "../ml/predict.py");

export function runLocalPrediction(text) {
  return new Promise((resolve, reject) => {
    const pythonPath = process.env.PYTHON_PATH || "python";
    const pythonPackagePath = process.env.PYTHON_PACKAGE_PATH || path.join(projectRootDir, ".python");
    const modelPath = process.env.MODEL_PATH || path.join(backendRootDir, "ml/LSTM_model.h5");
    const tokenizerPath = process.env.TOKENIZER_PATH || path.join(backendRootDir, "ml/tokenizer.pkl");

    const child = spawn(pythonPath, [predictorScript], {
      env: {
        ...process.env,
        MODEL_PATH: modelPath,
        TOKENIZER_PATH: tokenizerPath,
        PYTHONPATH: [
          pythonPackagePath,
          process.env.PYTHONPATH
        ].filter(Boolean).join(path.delimiter)
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to start local ML predictor: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Local ML predictor exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Invalid local ML predictor response: ${error.message}`));
      }
    });

    child.stdin.write(JSON.stringify({ text }));
    child.stdin.end();
  });
}
