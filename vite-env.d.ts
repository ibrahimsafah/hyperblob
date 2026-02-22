/// <reference types="vite/client" />

declare module '*.wgsl?raw' {
  const value: string;
  export default value;
}

declare module '*.wasm?url' {
  const url: string;
  export default url;
}
