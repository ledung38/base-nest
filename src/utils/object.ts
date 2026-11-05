export class ObjUtil {
  // const path = 'a.b.c';
  // const value = getObjectProperty(obj, path);
  // console.log(value); // Output: 42
  static accessPropertyByPath = (obj, path) => {
    return path.split('.').reduce((acc, key) => acc[key], obj);
  };
  // const path = 'a.b.c';
  // const value = 42;
  // const newObj = createObjectFromPath(path, value);
  // console.log(newObj); // Output: { a: { b: { c: 42 } } }
  static createObjectFromPath = (path, value) => {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const obj = {};

    keys.reduce((acc, key) => {
      acc[key] = {};
      return acc[key];
    }, obj)[lastKey] = value;

    return obj;
  };

  static truthyFalsy = (key, value, funVal?: any) => ({
    ...(value && { [key]: funVal ? funVal(value) : value }),
  });
}
