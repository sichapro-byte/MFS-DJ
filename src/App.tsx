import React, { useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { create } from 'zustand';

// Store
interface UIState {
  score: number;
  health: number;
  gameOver: boolean;
  gameStarted: boolean;
  audioFileUrl: string | null;
  setAudioFileUrl: (url: string | null) => void;
  incScore: () => void;
  decHealth: () => void;
  reset: () => void;
  startGame: () => void;
}

const useUIStore = create<UIState>((set) => ({
  score: 0,
  health: 3,
  gameOver: false,
  gameStarted: false,
  audioFileUrl: null,
  setAudioFileUrl: (url) => set({ audioFileUrl: url }),
  incScore: () => set((s) => ({ score: s.score + 10 })),
  decHealth: () => set((s) => {
    const next = s.health - 1;
    return { health: next, gameOver: next <= 0 };
  }),
  reset: () => set({ score: 0, health: 3, gameOver: false, gameStarted: true }),
  startGame: () => set({ score: 0, health: 3, gameOver: false, gameStarted: true })
}));

// Constants
const gridSize = 0.5;
const cx = -2;
const cz = 0;
const armBaseX = 11;
const armBaseZ = -8;
const baseStylusX = -12.5; 
const baseStylusZ = 12.5;

const MAX_ITEMS = 80;

type ItemInfo = {
  type: 'coin' | 'obstacle' | 'none';
  radius: number;
  angle: number;
  spawnRot: number;
  active: boolean;
};

interface Voxel {
  position: [number, number, number];
  color: string;
}

const dummy = new THREE.Object3D();

const globalInput = { left: false, right: false };

function generateVoxels() {
  const staticVoxels: Voxel[] = [];
  const spinningVoxels: Voxel[] = [];
  const armVoxels: Voxel[] = [];

  for (let x = -18; x <= 18; x++) {
    for (let y = -2; y <= 12; y++) {
      for (let z = -14; z <= 14; z++) {
        const posX = x * gridSize;
        const posY = y * gridSize;
        const posZ = z * gridSize;

        let inStatic = false;
        let inSpinning = false;
        let inArm = false;
        let color = '#ffffff';

        const platterR = Math.sqrt((x - cx)*(x - cx) + (z - cz)*(z - cz));
        const armBaseR = Math.sqrt((x - armBaseX)*(x - armBaseX) + (z - armBaseZ)*(z - armBaseZ));

        // Body
        if (x >= -16 && x <= 16 && z >= -12 && z <= 12 && y >= 0 && y <= 4) {
          inStatic = true;
          const hue = ((x + 16) / 32) * 0.15 + 0.55; 
          const lightness = 0.3 + (y / 4) * 0.2;
          color = `hsl(${Math.floor(hue * 360)}, 80%, ${Math.floor(lightness * 100)}%)`;
        }

        // Feet
        if (y === -1 || y === -2) {
          if (
            (Math.abs(x + 13) <= 1 && Math.abs(z + 9) <= 1) ||
            (Math.abs(x - 13) <= 1 && Math.abs(z + 9) <= 1) ||
            (Math.abs(x + 13) <= 1 && Math.abs(z - 9) <= 1) ||
            (Math.abs(x - 13) <= 1 && Math.abs(z - 9) <= 1)
          ) {
            inStatic = true;
            color = '#111111';
          }
        }

        // Platter base
        if (platterR < 10.5 && (y === 5 || y === 6)) {
          inSpinning = true;
          color = y === 5 ? '#aaaaaa' : '#bbbbbb';
          if (platterR >= 9.5 && Math.floor((Math.atan2(z - cz, x - cx) + Math.PI) * 16) % 2 === 0) {
             color = '#777777';
          }
        }

        // Record
        if (platterR < 9.5 && y === 7) {
          inSpinning = true;
          if (platterR > 3.5) {
            color = Math.floor(platterR * 4) % 2 === 0 ? '#111111' : '#1a1a1a';
          } else if (platterR > 0.5) {
            const angle = Math.atan2(z - cz, x - cx);
            const labelHue = ((angle + Math.PI) / (Math.PI * 2)) * 360;
            color = `hsl(${Math.floor(labelHue)}, 100%, 55%)`;
          } else {
            color = '#000000';
          }
        }

        // Pin
        if (platterR < 0.5 && y >= 5 && y <= 8) {
          inStatic = true;
          color = '#cccccc';
        }

        // Arm
        if (armBaseR < 3 && y > 4 && y <= 6) {
          inArm = true;
          color = '#333333';
        } else if (armBaseR < 1.5 && y > 6 && y <= 8) {
          inArm = true;
          color = '#cccccc';
        }

        const stylusX = -1.5;
        const stylusZ = 4.5;
        
        if (y === 8 || y === 9) {
          const dx = x - armBaseX, dz = z - armBaseZ;
          const sx = stylusX - armBaseX, sz = stylusZ - armBaseZ;
          let dist = 999;
          const lenSq = sx*sx + sz*sz;
          if (lenSq !== 0) {
              const param = (dx*sx + dz*sz) / lenSq;
              const t = Math.max(0, Math.min(1, param));
              const cx_line = armBaseX + t * sx;
              const cz_line = armBaseZ + t * sz;
              dist = Math.sqrt((x - cx_line)*(x - cx_line) + (z - cz_line)*(z - cz_line));
          }
          if (dist <= 0.8 && !inStatic && !inSpinning) {
            inArm = true;
            color = '#b3b3b3';
          }
        }
        
        if (y >= 7 && y <= 9 && Math.sqrt((x - stylusX)*(x - stylusX) + (z - stylusZ)*(z - stylusZ)) < 1.5) {
          inArm = true;
          color = '#ff3b30'; 
        }

        // Buttons
        if (x >= -14 && x <= -11 && z >= 8 && z <= 10 && y === 5) {
           inStatic = true;
           color = '#ff9500';
        }
        if (x >= 12 && x <= 14 && z >= 4 && z <= 10 && y === 5) {
           inStatic = true;
           color = '#111111';
        }
        if (x >= 12 && x <= 14 && z >= 6 && z <= 7 && y === 6) {
           inStatic = true;
           color = '#eeeeee';
        }

        if (inStatic) staticVoxels.push({ position: [posX, posY, posZ], color });
        else if (inSpinning) spinningVoxels.push({ position: [(x - cx)*gridSize, posY, (z - cz)*gridSize], color });
        else if (inArm) armVoxels.push({ position: [(x - armBaseX)*gridSize, posY, (z - armBaseZ)*gridSize], color });
      }
    }
  }

  return { staticVoxels, spinningVoxels, armVoxels };
}

function VoxelGroup({ voxels }: { voxels: Voxel[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  const colorArray = useMemo(() => {
    const array = new Float32Array(voxels.length * 3);
    voxels.forEach((v, i) => {
      color.set(v.color);
      color.toArray(array, i * 3);
    });
    return array;
  }, [voxels, color]);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    voxels.forEach((v, i) => {
      dummy.position.set(...v.position);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [voxels, dummy]);

  return (
    <instancedMesh ref={meshRef} args={[null as any, null as any, voxels.length]}>
      <boxGeometry args={[gridSize * 0.9, gridSize * 0.9, gridSize * 0.9]}>
        <instancedBufferAttribute attach="attributes-color" args={[colorArray, 3]} />
      </boxGeometry>
      <meshStandardMaterial vertexColors roughness={0.7} metalness={0.1} />
    </instancedMesh>
  );
}

// Global hook for audio logic
let audioContext: AudioContext | null = null;
let pannerNode: StereoPannerNode | null = null;
let audioElement: HTMLAudioElement | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;

function GameManager({ spinningVoxels, armVoxels }: any) {
   const armRef = useRef<THREE.Group>(null);
   const platterRef = useRef<THREE.Group>(null);
   
   const coinsMeshRef = useRef<THREE.InstancedMesh>(null);
   const obstaclesMeshRef = useRef<THREE.InstancedMesh>(null);
   
   const items = useRef<ItemInfo[]>(Array(MAX_ITEMS).fill(null).map(()=>({ type: 'none', radius: 0, angle: 0, spawnRot: 0, active: false })));
   const armAngle = useRef(0);
   const lastSpawn = useRef(0);
   const difficulty = useRef(0);

   useEffect(() => {
     const down = (e: KeyboardEvent) => {
       if (e.key === 'ArrowLeft' || e.key === 'a') globalInput.left = true;
       if (e.key === 'ArrowRight' || e.key === 'd') globalInput.right = true;
     };
     const up = (e: KeyboardEvent) => {
       if (e.key === 'ArrowLeft' || e.key === 'a') globalInput.left = false;
       if (e.key === 'ArrowRight' || e.key === 'd') globalInput.right = false;
     };
     window.addEventListener('keydown', down);
     window.addEventListener('keyup', up);
     return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
   }, []);

   useFrame((state, delta) => {
      const gState = useUIStore.getState();
      if (!gState.gameStarted || gState.gameOver) {
        if (audioElement && audioElement.volume > 0) {
           audioElement.volume = Math.max(0, audioElement.volume - delta * 2);
        }
        return;
      }

      if (audioElement && audioElement.volume < 1) {
         audioElement.volume = Math.min(1, audioElement.volume + delta * 2);
      }

      const time = state.clock.elapsedTime;
      difficulty.current += delta * 0.02;

      let targetPlaybackRate = 1.0;

      if (globalInput.left) {
        armAngle.current = Math.max(armAngle.current - delta * 2.0, -0.45);
        targetPlaybackRate = 0.5; // Slow down playback
        if (audioElement && audioElement.readyState >= 2) {
           // Scrub backward to simulate rewind/scratching
           audioElement.currentTime = Math.max(0, audioElement.currentTime - delta * 2.5);
        }
      }
      if (globalInput.right) {
        armAngle.current = Math.min(armAngle.current + delta * 2.0, 0.40);
        targetPlaybackRate = 2.0; // Speed up
      }

      if (audioElement && typeof audioElement.playbackRate !== 'undefined') {
        const diff = targetPlaybackRate - audioElement.playbackRate;
        audioElement.playbackRate += diff * 10 * delta;
      }

      if (pannerNode) {
        const panValue = (armAngle.current / 0.45);
        pannerNode.pan.value = Math.max(-1, Math.min(1, panValue));
      }

      if (armRef.current) {
         armRef.current.rotation.y = THREE.MathUtils.damp(armRef.current.rotation.y, armAngle.current, 10, delta);
      }

      const platterSpeed = 1.0 + Math.min(difficulty.current, 1.5);

      if (platterRef.current) {
         platterRef.current.rotation.y -= delta * platterSpeed;
      }

      const spawnInterval = Math.max(0.4, 1.2 - difficulty.current * 0.4);
      if (time - lastSpawn.current > spawnInterval) {
         const emptyIdx = items.current.findIndex(i => !i.active);
         if (emptyIdx !== -1) {
             const it = items.current[emptyIdx];
             it.active = true;
             it.type = Math.random() > 0.4 ? 'coin' : 'obstacle';
             it.radius = 4.0 + Math.random() * 4.5;
             it.spawnRot = platterRef.current!.rotation.y;
             it.angle = -it.spawnRot + Math.PI; 
         }
         lastSpawn.current = time;
      }

      const platterRot = platterRef.current!.rotation.y;
      const cosA = Math.cos(armRef.current!.rotation.y);
      const sinA = Math.sin(armRef.current!.rotation.y);
      
      const stylusWorldX = (armBaseX * gridSize) + (baseStylusX * gridSize * cosA - baseStylusZ * gridSize * sinA);
      const stylusWorldZ = (armBaseZ * gridSize) + (baseStylusX * gridSize * sinA + baseStylusZ * gridSize * cosA);

      for (let i=0; i<MAX_ITEMS; i++) {
         const it = items.current[i];
         if (!it.active) {
            dummy.scale.set(0,0,0);
            dummy.updateMatrix();
            coinsMeshRef.current!.setMatrixAt(i, dummy.matrix);
            obstaclesMeshRef.current!.setMatrixAt(i, dummy.matrix);
            continue;
         }

         dummy.position.set(it.radius * gridSize * Math.cos(it.angle), 7.5 * gridSize + Math.abs(Math.sin(time * 5 + i)) * 0.4, it.radius * gridSize * Math.sin(it.angle));
         
         dummy.scale.set(1,1,1);
         dummy.rotation.x = time * 2;
         dummy.rotation.y = time * 2;
         dummy.updateMatrix();

         if (it.type === 'coin') {
             coinsMeshRef.current!.setMatrixAt(i, dummy.matrix);
             dummy.scale.set(0,0,0);
             dummy.updateMatrix();
             obstaclesMeshRef.current!.setMatrixAt(i, dummy.matrix);
         } else {
             obstaclesMeshRef.current!.setMatrixAt(i, dummy.matrix);
             dummy.scale.set(0,0,0);
             dummy.updateMatrix();
             coinsMeshRef.current!.setMatrixAt(i, dummy.matrix);
         }

         const worldAngle = it.angle + platterRot;
         const objWorldX = (cx * gridSize) + (it.radius * gridSize) * Math.cos(worldAngle);
         const objWorldZ = (cz * gridSize) + (it.radius * gridSize) * Math.sin(worldAngle);
         
         const dx = stylusWorldX - objWorldX;
         const dz = stylusWorldZ - objWorldZ;
         const distSq = dx*dx + dz*dz;

         if (distSq < 1.0) { 
            it.active = false;
            if (it.type === 'coin') gState.incScore();
            else gState.decHealth();
         }

         if (Math.abs(platterRot - it.spawnRot) > Math.PI * 1.5) {
            it.active = false;
         }
      }

      coinsMeshRef.current!.instanceMatrix.needsUpdate = true;
      obstaclesMeshRef.current!.instanceMatrix.needsUpdate = true;
   });

   useEffect(() => {
      const unsub = useUIStore.subscribe((state, prevState) => {
         if (state.gameStarted && !prevState.gameStarted) {
             items.current.forEach(i => i.active = false);
             lastSpawn.current = 0;
             difficulty.current = 0;
             armAngle.current = 0;
         }
      });
      return unsub;
   }, []);

   return (
     <>
        <group position={[cx * gridSize, 0, cz * gridSize]} ref={platterRef}>
           <VoxelGroup voxels={spinningVoxels} />
           <instancedMesh ref={coinsMeshRef} args={[null as any, null as any, MAX_ITEMS]}>
              <boxGeometry args={[gridSize*0.6, gridSize*0.6, gridSize*0.6]} />
              <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.5} roughness={0.2} metalness={0.8} />
           </instancedMesh>
           <instancedMesh ref={obstaclesMeshRef} args={[null as any, null as any, MAX_ITEMS]}>
              <boxGeometry args={[gridSize*0.8, gridSize*0.8, gridSize*0.8]} />
              <meshStandardMaterial color="#ef4444" emissive="#991b1b" emissiveIntensity={0.5} roughness={0.4} metalness={0.1} />
           </instancedMesh>
        </group>
        <group position={[armBaseX * gridSize, 0, armBaseZ * gridSize]} ref={armRef}>
           <VoxelGroup voxels={armVoxels} />
        </group>
     </>
   );
}

function HUD() {
  const { score, health, gameStarted, gameOver, startGame, reset, audioFileUrl, setAudioFileUrl } = useUIStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [songName, setSongName] = React.useState<string>("Loading track...");

  useEffect(() => {
    // Fetch ENHYPEN track preview from iTunes API
    fetch('https://itunes.apple.com/search?term=enhypen&entity=song&limit=15')
      .then(res => res.json())
      .then(data => {
         if (data.results && data.results.length > 0) {
            const track = data.results[Math.floor(Math.random() * data.results.length)];
            setAudioFileUrl(track.previewUrl);
            setSongName(`${track.trackName} - ${track.artistName}`);
         } else {
            setSongName("Track not found");
         }
      })
      .catch(err => {
         console.error("Could not load song preview", err);
         setSongName("Failed to load track");
      });
  }, [setAudioFileUrl]);

  const handleStart = async () => {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    if (!audioElement) {
      audioElement = new Audio();
      audioElement.loop = true;
      audioElement.crossOrigin = "anonymous";
      sourceNode = audioContext.createMediaElementSource(audioElement);
      pannerNode = audioContext.createStereoPanner();
      sourceNode.connect(pannerNode);
      pannerNode.connect(audioContext.destination);
    }

    if (audioFileUrl) {
      audioElement.src = audioFileUrl;
    }

    if (audioElement.src) {
       audioElement.volume = 1;
       audioElement.play().catch(e => console.warn("Audio play blocked", e));
    }

    startGame();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioFileUrl(url);
      setSongName(`Custom File: ${file.name}`);
    }
  };

  useEffect(() => {
    if (gameOver && audioElement) {
       setTimeout(() => {
          if (audioElement) audioElement.pause();
       }, 500);
    }
  }, [gameOver]);

  useEffect(() => {
    return () => {
      if (audioFileUrl && audioFileUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioFileUrl);
      }
    };
  }, [audioFileUrl]);

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-4 sm:p-8 font-sans z-50">
       {gameStarted && !gameOver && (
          <>
            <div className="w-full max-w-4xl flex justify-between text-white text-xl sm:text-2xl font-bold bg-black/50 p-3 sm:p-4 rounded-xl backdrop-blur-md">
               <div className="flex gap-2">Health: {Array.from({length: Math.max(0, health)}).map((_,i) => <span key={i} className="text-red-500">❤️</span>)}</div>
               <div>Score: <span className="text-yellow-400">{score}</span></div>
            </div>
            
            <div className="absolute inset-0 z-10 w-full h-full flex flex-row pointer-events-auto sm:hidden mt-20">
               <div 
                 className="flex-1"
                 onPointerDown={(e) => { e.preventDefault(); globalInput.left = true; }}
                 onPointerUp={(e) => { e.preventDefault(); globalInput.left = false; }}
                 onPointerLeave={() => globalInput.left = false}
                 onPointerCancel={() => globalInput.left = false}
               />
               <div 
                 className="flex-1"
                 onPointerDown={(e) => { e.preventDefault(); globalInput.right = true; }}
                 onPointerUp={(e) => { e.preventDefault(); globalInput.right = false; }}
                 onPointerLeave={() => globalInput.right = false}
                 onPointerCancel={() => globalInput.right = false}
               />
            </div>
            
            <div className="absolute bottom-10 left-0 w-full flex justify-between px-8 sm:hidden z-20 pointer-events-none">
              <div className="w-16 h-16 bg-white/10 border-2 border-white/20 backdrop-blur-md rounded-full text-white/50 text-3xl font-bold flex items-center justify-center transition-all bg-zinc-800">
                 &lt;
              </div>
              <div className="w-16 h-16 bg-white/10 border-2 border-white/20 backdrop-blur-md rounded-full text-white/50 text-3xl font-bold flex items-center justify-center transition-all bg-zinc-800">
                 &gt;
              </div>
            </div>
          </>
       )}

       {!gameStarted && !gameOver && (
          <div className="m-auto pointer-events-auto bg-zinc-900/90 text-white p-6 sm:p-12 rounded-3xl border-4 border-red-900/40 flex flex-col items-center text-center backdrop-blur-xl max-w-[90vw]">
             <h1 className="text-4xl sm:text-6xl font-black mb-4 sm:mb-6 text-transparent bg-clip-text bg-gradient-to-br from-red-600 to-orange-500 tracking-tight leading-tight">ENHYPEN<br className="sm:hidden" /> VOXEL DJ</h1>
             <p className="text-base sm:text-xl text-zinc-300 mb-6 sm:mb-8 max-w-md">Use <strong className="text-white bg-zinc-800 px-2 py-1 rounded mx-1">Left</strong> and <strong className="text-white bg-zinc-800 px-2 py-1 rounded mx-1">Right</strong> arrows (or tap sides of screen) to DJ. Moving the arm pans the audio and scratches the song!</p>
             
             <div className="mb-6 p-4 bg-zinc-800/80 rounded-xl w-full max-w-sm border border-zinc-700">
               <p className="text-sm font-medium text-zinc-300 mb-2">Current Track:</p>
               <div className="text-green-400 font-bold text-sm mb-4 truncate w-full" title={songName}>{songName}</div>
               <p className="text-xs font-medium text-zinc-500 mb-2 mt-4 uppercase tracking-wider">Or upload custom track (MP3/WAV)</p>
               <input 
                 type="file" 
                 ref={fileInputRef}
                 accept="audio/*" 
                 onChange={handleFileChange}
                 className="block w-full text-xs text-zinc-400 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-red-500 file:text-white hover:file:bg-red-600 focus:outline-none transition-colors"
               />
             </div>

             <button onClick={handleStart} className="px-8 py-3 sm:px-10 sm:py-4 bg-white text-black text-xl sm:text-2xl font-bold rounded-full hover:scale-105 active:scale-95 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.4)]">PLAY NOW</button>
          </div>
       )}

       {gameOver && (
          <div className="m-auto pointer-events-auto bg-zinc-900/90 text-white p-6 sm:p-12 rounded-3xl border-4 border-red-900/80 flex flex-col items-center backdrop-blur-xl max-w-[90vw]">
             <h1 className="text-5xl sm:text-6xl font-black mb-4 text-red-500 tracking-tight text-center">GAME OVER</h1>
             <p className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8 text-zinc-300 text-center">Final Score: <span className="text-yellow-400">{score}</span></p>
             <button onClick={() => {
                if (audioElement && audioFileUrl) {
                   audioElement.currentTime = 0;
                   audioElement.play().catch(e => console.warn(e));
                } else if (audioElement) {
                   audioElement.play().catch(e => console.warn(e));
                }
                reset();
             }} className="mb-4 px-8 py-3 sm:px-10 sm:py-4 bg-red-600 text-white text-xl sm:text-2xl font-bold rounded-full hover:bg-red-500 hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(220,38,38,0.5)]">PLAY AGAIN</button>
             
             <button onClick={() => window.location.reload()} className="text-zinc-400 underline hover:text-white mt-4">Change Song</button>
          </div>
       )}
    </div>
  )
}

export default function App() {
  const { staticVoxels, spinningVoxels, armVoxels } = useMemo(generateVoxels, []);

  return (
    <div className="relative w-screen h-screen bg-zinc-950 overflow-hidden">
      <Canvas
        camera={{ position: [18, 14, 22], fov: 45 }}
        gl={{ pixelRatio: 2, antialias: false }}
      >
        <color attach="background" args={["#09090b"]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 20, 10]} intensity={1.5} castShadow />
        <pointLight position={[-10, 10, -10]} intensity={0.5} />
        
        <group position={[0, -3, 0]}>
          <VoxelGroup voxels={staticVoxels} />
          <GameManager spinningVoxels={spinningVoxels} armVoxels={armVoxels} />
          <ContactShadows position={[0, -1.01, 0]} opacity={0.6} scale={40} blur={2} far={10} />
        </group>

        <OrbitControls makeDefault enablePan={false} maxPolarAngle={Math.PI / 2.1} minDistance={10} maxDistance={40} />
        <Environment preset="city" />
      </Canvas>
      <HUD />
    </div>
  );
}
