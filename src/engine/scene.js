// Менеджер сцен (стек одного уровня): лобби, слоты, и далее блэкджек/рулетка/плинко.
// Каждая сцена: { enter(arg)?, exit()?, update(dt)?, render(g)? }.
export function createSceneManager() {
  const scenes = {};
  let current = null;
  let currentName = null;

  return {
    register(name, scene) { scenes[name] = scene; },
    go(name, arg) {
      if (current && current.exit) current.exit();
      current = scenes[name];
      currentName = name;
      if (current && current.enter) current.enter(arg);
    },
    get name() { return currentName; },
    update(dt) { if (current && current.update) current.update(dt); },
    render(g) { if (current && current.render) current.render(g); },
  };
}
