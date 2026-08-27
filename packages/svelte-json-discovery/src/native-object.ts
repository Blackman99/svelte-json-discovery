export function hasNativeObjectSource(value: object): boolean {
    return Function.prototype.toString.call(value) === Function.prototype.toString.call(Object);
}
