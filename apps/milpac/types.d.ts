// global.d.ts
export {}; // This ensures the file is treated as a module.

declare module "@canvas-fonts/times-new-roman";
declare module "@hckrnews/ppt2pdf" {
  export default function convert(options: {
    inputFileName: string;
    outputDir: string;
    timestamp: number;
  }): Promise<void>;
}

