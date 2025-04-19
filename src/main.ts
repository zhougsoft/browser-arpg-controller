import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import './style.css'

const FIXED_TIME_STEP = 1 / 60 // seconds
const GRAVITY = -9.81 // m/s²
const MOVE_SPEED = 10 // units/s
const STOP_THRESHOLD = 0.1 // min distance to stop
const GROUND_HALF_SIZE = 10 // half-dimension of ground plane
const ORTHO_FRUSTUM_SIZE = 20 // ortho camera half-size
const CAMERA_OFFSET = new THREE.Vector3(10, 10, 10) // iso camera offset

async function main() {
  // --- physics
  await RAPIER.init()
  const physicsWorld = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 })

  // --- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  document.body.appendChild(renderer.domElement)

  // --- scene
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#222')

  // --- camera
  const aspect = window.innerWidth / window.innerHeight
  const camera = new THREE.OrthographicCamera(
    (-ORTHO_FRUSTUM_SIZE * aspect) / 2,
    (ORTHO_FRUSTUM_SIZE * aspect) / 2,
    ORTHO_FRUSTUM_SIZE / 2,
    -ORTHO_FRUSTUM_SIZE / 2,
    0.1,
    100
  )
  camera.position.copy(new THREE.Vector3()).add(CAMERA_OFFSET)
  camera.lookAt(0, 0, 0)

  // --- lights
  const dirLight = new THREE.DirectionalLight(0xffffff, 1)
  dirLight.position.set(5, 10, 5)
  dirLight.castShadow = true
  scene.add(dirLight)

  // --- ground plane
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x888888 })
  const groundGeo = new THREE.PlaneGeometry(
    GROUND_HALF_SIZE * 2,
    GROUND_HALF_SIZE * 2
  )
  const groundMesh = new THREE.Mesh(groundGeo, groundMat)
  groundMesh.rotation.x = -Math.PI / 2
  groundMesh.receiveShadow = true
  scene.add(groundMesh)

  const groundBodyDesc = RAPIER.RigidBodyDesc.fixed()
  const groundBody = physicsWorld.createRigidBody(groundBodyDesc)
  const groundCollider = RAPIER.ColliderDesc.cuboid(
    GROUND_HALF_SIZE,
    0.1,
    GROUND_HALF_SIZE
  )
  physicsWorld.createCollider(groundCollider, groundBody)

  // --- player
  const playerBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 1, 0)
    .lockRotations() // prevent spinning
  const playerBody = physicsWorld.createRigidBody(playerBodyDesc)
  physicsWorld.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.5), playerBody)

  const playerMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x00ff00 })
  )
  playerMesh.castShadow = true
  scene.add(playerMesh)

  // --- input & targeting
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  let targetPos: THREE.Vector3 | null = null
  let isMouseDown = false

  function updateTarget(event: MouseEvent) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(mouse, camera)

    const hitPoint = new THREE.Vector3()
    raycaster.ray.intersectPlane(groundPlane, hitPoint)

    // clamp within ground bounds
    hitPoint.x = THREE.MathUtils.clamp(
      hitPoint.x,
      -GROUND_HALF_SIZE,
      GROUND_HALF_SIZE
    )
    hitPoint.z = THREE.MathUtils.clamp(
      hitPoint.z,
      -GROUND_HALF_SIZE,
      GROUND_HALF_SIZE
    )
    hitPoint.y = 1

    targetPos = hitPoint
  }

  // --- event handlers
  window.addEventListener('mousedown', e => {
    isMouseDown = true
    updateTarget(e)
  })
  window.addEventListener('mousemove', e => {
    if (isMouseDown) updateTarget(e)
  })
  window.addEventListener('mouseup', () => {
    isMouseDown = false
  })

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    const a = window.innerWidth / window.innerHeight
    camera.left = (-ORTHO_FRUSTUM_SIZE * a) / 2
    camera.right = (ORTHO_FRUSTUM_SIZE * a) / 2
    camera.top = ORTHO_FRUSTUM_SIZE / 2
    camera.bottom = -ORTHO_FRUSTUM_SIZE / 2
    camera.updateProjectionMatrix()
  })

  // --- fixed timestep loop
  const clock = new THREE.Clock()
  let accumulator = 0

  function animate() {
    const delta = clock.getDelta()
    accumulator += delta

    while (accumulator >= FIXED_TIME_STEP) {
      physicsWorld.step()
      accumulator -= FIXED_TIME_STEP
    }

    // player movement toward target
    if (targetPos) {
      const pos = playerBody.translation()
      const current = new THREE.Vector3(pos.x, pos.y, pos.z)
      const dir = targetPos.clone().sub(current)
      const dist = dir.length()

      if (dist > STOP_THRESHOLD) {
        dir.normalize()
        playerBody.setLinvel(
          { x: dir.x * MOVE_SPEED, y: 0, z: dir.z * MOVE_SPEED },
          true
        )
        playerMesh.lookAt(targetPos.x, current.y, targetPos.z)
      } else {
        playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
        targetPos = null
      }
    }

    // sync mesh & camera
    const t = playerBody.translation()
    playerMesh.position.set(t.x, t.y, t.z)
    camera.position.copy(playerMesh.position).add(CAMERA_OFFSET)
    camera.lookAt(playerMesh.position)

    // render scene
    renderer.render(scene, camera)
    requestAnimationFrame(animate)
  }

  animate()
}

main().catch(console.error)
