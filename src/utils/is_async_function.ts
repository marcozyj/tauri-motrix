export default function isAsyncFunction(fn: CallableFunction): boolean {
  return fn.constructor.name === "AsyncFunction";
}
