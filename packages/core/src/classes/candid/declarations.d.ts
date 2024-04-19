declare module "@ic-reactor/parser" {
  export default function (): Promise<void>
  export function did_to_js(candidSource: string): Promise<string>
}
