/* 
  Three.js + Cannon.js
*/
window.focus(); // Capturar claves de inmediato (por defecto, el enfoque está en el editor)

let camera, scene, renderer; // Globales ThreeJS 
let world; // Mundo CannonJs
let lastTime; // Última marca de tiempo de animación
let stack; // Piezas que permanecen sólidas una encima de la otra
let overhangs; // Partes que sobresalen y que se caen
const boxHeight = 1; // Altura de cada capa
const originalBoxSize = 3; // Ancho original y altura de una caja
let autopilot;
let gameEnded;
let robotPrecision; // Determina cuán preciso es el juego en piloto automático

const scoreElement = document.getElementById("score");
const instructionsElement = document.getElementById("instructions");
const resultsElement = document.getElementById("results");

init();

// Determina cuán preciso es el juego en piloto automático
function setRobotPrecision() {
  robotPrecision = Math.random() * 1 - 0.5;
}

function init() {
  autopilot = true;
  gameEnded = false;
  lastTime = 0;
  stack = [];
  overhangs = [];
  setRobotPrecision();

  // Inicializar Cannonjs
  world = new CANNON.World();
  world.gravity.set(0, -10, 0); // La gravedad derriba las cosas
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 40;

  // Inicializar ThreeJs
  const aspect = window.innerWidth / window.innerHeight;
  const width = 10;
  const height = width / aspect;

  camera = new THREE.OrthographicCamera(
    width / -2, // izquierda
    width / 2, // derecha
    height / 2, // arriba
    height / -2, // abajo
    0, // plano cercano
    100 // plano lejano
  );

  /*
  // Si quieres usar la cámara de perspectiva, descomenta estas líneas
  camera = new THREE.PerspectiveCamera(
    45, // field of view
    aspect, // aspect ratio
    1, // near plane
    100 // far plane
  );
  */

  camera.position.set(4, 4, 4);
  camera.lookAt(0, 0, 0);

  scene = new THREE.Scene();

  // base
  addLayer(0, 0, originalBoxSize, originalBoxSize);

  // primera capa
  addLayer(-10, 0, originalBoxSize, originalBoxSize, "x");

  // Configurar luces
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(10, 20, 0);
  scene.add(dirLight);

  // Configurar renderizador
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animation);
  document.body.appendChild(renderer.domElement);
}

function startGame() {
  autopilot = false;
  gameEnded = false;
  lastTime = 0;
  stack = [];
  overhangs = [];

  if (instructionsElement) instructionsElement.style.display = "none";
  if (resultsElement) resultsElement.style.display = "none";
  if (scoreElement) scoreElement.innerText = 0;

  if (world) {
    // Eliminar cada objeto del mundo
    while (world.bodies.length > 0) {
      world.remove(world.bodies[0]);
    }
  }

  if (scene) {
    // Eliminar cada malla de la escena
    while (scene.children.find((c) => c.type == "Mesh")) {
      const mesh = scene.children.find((c) => c.type == "Mesh");
      scene.remove(mesh);
    }

    // base
    addLayer(0, 0, originalBoxSize, originalBoxSize);

    // primera capa
    addLayer(-10, 0, originalBoxSize, originalBoxSize, "x");
  }

  if (camera) {
    // Resetear posición camaras
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);
  }
}

function addLayer(x, z, width, depth, direction) {
  const y = boxHeight * stack.length; // Agregue la nueva caja una capa más alta
  const layer = generateBox(x, y, z, width, depth, false);
  layer.direction = direction;
  stack.push(layer);
}

function addOverhang(x, z, width, depth) {
  const y = boxHeight * (stack.length - 1); // Agregue el nuevo cuadro uno la misma capa
  const overhang = generateBox(x, y, z, width, depth, true);
  overhangs.push(overhang);
}

function generateBox(x, y, z, width, depth, falls) {
  // ThreeJS
  const geometry = new THREE.BoxGeometry(width, boxHeight, depth);
  const color = new THREE.Color(`hsl(${30 + stack.length * 4}, 100%, 50%)`);
  const material = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  scene.add(mesh);

  // CannonJS
  const shape = new CANNON.Box(
    new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2)
  );
  let mass = falls ? 5 : 0; // Si no caiga, entonces establecer la masa en cero la mantendrá estacionaria

  mass *= width / originalBoxSize; // Reducir la masa proporcionalmente por tamaño
  mass *= depth / originalBoxSize; // Reducir la masa proporcionalmente por tamaño
  const body = new CANNON.Body({ mass, shape });
  body.position.set(x, y, z);
  world.addBody(body);

  return {
    threejs: mesh,
    cannonjs: body,
    width,
    depth
  };
}

function cutBox(topLayer, overlap, size, delta) {
  const direction = topLayer.direction;
  const newWidth = direction == "x" ? overlap : topLayer.width;
  const newDepth = direction == "z" ? overlap : topLayer.depth;

  // actualizar metadata
  topLayer.width = newWidth;
  topLayer.depth = newDepth;

  // actualizar modelo ThreeJS
  topLayer.threejs.scale[direction] = overlap / size;
  topLayer.threejs.position[direction] -= delta / 2;

  // actualizar modelo CannonJS
  topLayer.cannonjs.position[direction] -= delta / 2;

  // Reemplace la forma a una más pequeña (en Cannonjs no puede simplemente escalar una forma)
  const shape = new CANNON.Box(
    new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2)
  );
  topLayer.cannonjs.shapes = [];
  topLayer.cannonjs.addShape(shape);
}

window.addEventListener("mousedown", eventHandler);
window.addEventListener("touchstart", eventHandler);
window.addEventListener("keydown", function (event) {
  if (event.key == " ") {
    event.preventDefault();
    eventHandler();
    return;
  }
  if (event.key == "R" || event.key == "r") {
    event.preventDefault();
    startGame();
    return;
  }
});

function eventHandler() {
  if (autopilot) startGame();
  else splitBlockAndAddNextOneIfOverlaps();
}

function splitBlockAndAddNextOneIfOverlaps() {
  if (gameEnded) return;

  const topLayer = stack[stack.length - 1];
  const previousLayer = stack[stack.length - 2];

  const direction = topLayer.direction;

  const size = direction == "x" ? topLayer.width : topLayer.depth;
  const delta =
    topLayer.threejs.position[direction] -
    previousLayer.threejs.position[direction];
  const overhangSize = Math.abs(delta);
  const overlap = size - overhangSize;

  if (overlap > 0) {
    cutBox(topLayer, overlap, size, delta);

    // Sobresalir
    const overhangShift = (overlap / 2 + overhangSize / 2) * Math.sign(delta);
    const overhangX =
      direction == "x"
        ? topLayer.threejs.position.x + overhangShift
        : topLayer.threejs.position.x;
    const overhangZ =
      direction == "z"
        ? topLayer.threejs.position.z + overhangShift
        : topLayer.threejs.position.z;
    const overhangWidth = direction == "x" ? overhangSize : topLayer.width;
    const overhangDepth = direction == "z" ? overhangSize : topLayer.depth;

    addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);

    // siguiente capa
    const nextX = direction == "x" ? topLayer.threejs.position.x : -10;
    const nextZ = direction == "z" ? topLayer.threejs.position.z : -10;
    const newWidth = topLayer.width; // La nueva capa tiene el mismo tamaño que la capa superior cortada
    const newDepth = topLayer.depth; // La nueva capa tiene el mismo tamaño que la capa superior cortada
    const nextDirection = direction == "x" ? "z" : "x";

    if (scoreElement) scoreElement.innerText = stack.length - 1;
    addLayer(nextX, nextZ, newWidth, newDepth, nextDirection);
  } else {
    missedTheSpot();
  }
}

function missedTheSpot() {
  const topLayer = stack[stack.length - 1];

  // Girar la capa superior en un voladizo y dejar que se caiga
  addOverhang(
    topLayer.threejs.position.x,
    topLayer.threejs.position.z,
    topLayer.width,
    topLayer.depth
  );
  world.remove(topLayer.cannonjs);
  scene.remove(topLayer.threejs);

  gameEnded = true;
  if (resultsElement && !autopilot) resultsElement.style.display = "flex";
}

function animation(time) {
  if (lastTime) {
    const timePassed = time - lastTime;
    const speed = 0.008;

    const topLayer = stack[stack.length - 1];
    const previousLayer = stack[stack.length - 2];

   // El cuadro de nivel superior debe moverse si el juego no ha terminado y
     // No está en piloto automático o está en piloto automático y el cuadro aún no alcanzó la posición del robot
    const boxShouldMove =
      !gameEnded &&
      (!autopilot ||
        (autopilot &&
          topLayer.threejs.position[topLayer.direction] <
            previousLayer.threejs.position[topLayer.direction] +
              robotPrecision));

    if (boxShouldMove) {
      //  Manter la posición visible en la interfaz de usuario y la posición en el modelo sincronizado
      topLayer.threejs.position[topLayer.direction] += speed * timePassed;
      topLayer.cannonjs.position[topLayer.direction] += speed * timePassed;

      // Si la caja fue más allá de la pila, entonces muestre la pantalla de falla

      if (topLayer.threejs.position[topLayer.direction] > 10) {
        missedTheSpot();
      }
    } else {
      // Si no se moviera, ¿es porque el piloto automático alcanzó la posición correcta?
       // porque si es así, entonces viene el siguiente nivel
      if (autopilot) {
        splitBlockAndAddNextOneIfOverlaps();
        setRobotPrecision();
      }
    }

    // 4 es la altura inicial de la cámara con respecto a los bloques
    if (camera.position.y < boxHeight * (stack.length - 2) + 4) {
      camera.position.y += speed * timePassed;
    }

    updatePhysics(timePassed);
    renderer.render(scene, camera);
  }
  lastTime = time;
}

function updatePhysics(timePassed) {
  world.step(timePassed / 1000); // Pasar física

  // Copiar coordenadas de Cannon.js a tres.js
  overhangs.forEach((element) => {
    element.threejs.position.copy(element.cannonjs.position);
    element.threejs.quaternion.copy(element.cannonjs.quaternion);
  });
}

window.addEventListener("resize", () => {
  // Ajustar cámara
  console.log("resize", window.innerWidth, window.innerHeight);
  const aspect = window.innerWidth / window.innerHeight;
  const width = 10;
  const height = width / aspect;

  camera.top = height / 2;
  camera.bottom = height / -2;

  // Restablecer Renderizador
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
});