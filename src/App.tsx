/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Clock, Target, Play, RotateCcw, Coins, Mic, MicOff, Settings, Sliders, Smartphone } from 'lucide-react';
import { 
  GameState, 
  GameObject, 
  HookState,
  Explosion
} from './types';
import { 
  CANVAS_WIDTH, 
  CANVAS_HEIGHT, 
  MINER_X, 
  MINER_Y, 
  HOOK_MIN_LENGTH, 
  HOOK_MAX_LENGTH, 
  SWING_SPEED, 
  EXTEND_SPEED, 
  RETRACT_SPEED_BASE, 
  LEVELS, 
  OBJECT_TYPES,
  MINER_IMAGE,
  SOUNDS
} from './constants';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [level, setLevel] = useState(0);
  const [score, setScore] = useState(0);
  const [gameTimeSetting, setGameTimeSetting] = useState(60);
  const [timeLeft, setTimeLeft] = useState(60);
  const [showTimeSettings, setShowTimeSettings] = useState(false);
  const [isClapEnabled, setIsClapEnabled] = useState(false);
  const [clapThreshold, setClapThreshold] = useState(0.2);
  const [isMotionEnabled, setIsMotionEnabled] = useState(false);
  const [motionThreshold, setMotionThreshold] = useState(15);
  const [objects, setObjects] = useState<GameObject[]>([]);
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  const [hook, setHook] = useState<HookState>({
    angle: Math.PI / 2,
    length: HOOK_MIN_LENGTH,
    status: 'swinging',
    attachedObject: null,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);
  const swingDirection = useRef(1);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const audioRef = useRef<Record<string, HTMLAudioElement>>({});

  const playSound = useCallback((name: keyof typeof SOUNDS) => {
    const audio = audioRef.current[name];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(e => console.log('Audio play failed:', e));
    }
  }, []);

  // Preload Images and Sounds
  useEffect(() => {
    const loadedImages: Record<string, HTMLImageElement> = {};
    
    // Preload object images
    Object.entries(OBJECT_TYPES).forEach(([key, config]) => {
      const img = new Image();
      img.src = config.image;
      img.referrerPolicy = "no-referrer";
      img.onload = () => {
        loadedImages[key] = img;
      };
      loadedImages[key] = img;
    });

    // Preload miner image
    const minerImg = new Image();
    minerImg.src = MINER_IMAGE;
    minerImg.referrerPolicy = "no-referrer";
    minerImg.onload = () => {
      loadedImages['miner'] = minerImg;
    };
    loadedImages['miner'] = minerImg;

    imagesRef.current = loadedImages;

    // Preload sounds
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audioRef.current[key] = audio;
    });
  }, []);

  // Initialize Level
  const initLevel = useCallback((levelIdx: number) => {
    const currentLevel = LEVELS[Math.min(levelIdx, LEVELS.length - 1)];
    const newObjects: GameObject[] = [];
    const types = Object.keys(OBJECT_TYPES) as (keyof typeof OBJECT_TYPES)[];

    for (let i = 0; i < currentLevel.objects; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const config = OBJECT_TYPES[type];
      if (!config) continue;
      
      // Ensure objects don't overlap too much and are in the ground area
      let x, y, collision;
      let attempts = 0;
      do {
        x = Math.random() * (CANVAS_WIDTH - 100) + 50;
        y = Math.random() * (CANVAS_HEIGHT - 250) + 200;
        collision = newObjects.some(obj => {
          const dist = Math.sqrt((obj.x - x) ** 2 + (obj.y - y) ** 2);
          return dist < (obj.radius + config.radius + 10);
        });
        attempts++;
      } while (collision && attempts < 50);

      newObjects.push({
        id: Math.random().toString(36).substr(2, 9),
        x,
        y,
        radius: config.radius,
        type,
        value: config.value,
        weight: config.weight,
      });
    }

    setObjects(newObjects);
    setExplosions([]);
    setTimeLeft(gameTimeSetting);
    setHook({
      angle: Math.PI / 2,
      length: HOOK_MIN_LENGTH,
      status: 'swinging',
      attachedObject: null,
    });
  }, [gameTimeSetting]);

  const startGame = () => {
    setScore(0);
    setLevel(0);
    setGameState(GameState.PLAYING);
    initLevel(0);
  };

  const nextLevel = () => {
    const nextIdx = level + 1;
    setLevel(nextIdx);
    setGameState(GameState.PLAYING);
    initLevel(nextIdx);
  };

  const handleAction = useCallback(() => {
    if (gameState === GameState.PLAYING && hook.status === 'swinging') {
      setHook(prev => ({ ...prev, status: 'extending' }));
    }
  }, [gameState, hook.status]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowDown') {
        handleAction();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAction]);

  useEffect(() => {
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let microphone: MediaStreamAudioSourceNode | null = null;
    let javascriptNode: ScriptProcessorNode | null = null;
    let stream: MediaStream | null = null;

    if (isClapEnabled && gameState === GameState.PLAYING) {
      const startListening = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          analyser = audioContext.createAnalyser();
          microphone = audioContext.createMediaStreamSource(stream);
          javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

          analyser.smoothingTimeConstant = 0.3;
          analyser.fftSize = 1024;

          microphone.connect(analyser);
          analyser.connect(javascriptNode);
          javascriptNode.connect(audioContext.destination);

          let lastClapTime = 0;
          const CLAP_COOLDOWN = 1000; // 1 second between claps

          javascriptNode.onaudioprocess = () => {
            const array = new Uint8Array(analyser!.frequencyBinCount);
            analyser!.getByteFrequencyData(array);
            let values = 0;

            const length = array.length;
            for (let i = 0; i < length; i++) {
              values += array[i];
            }

            const average = values / length / 255; // Normalize to 0-1

            if (average > clapThreshold) {
              const now = Date.now();
              if (now - lastClapTime > CLAP_COOLDOWN) {
                lastClapTime = now;
                handleAction();
              }
            }
          };
        } catch (err) {
          console.error('Error accessing microphone:', err);
          setIsClapEnabled(false);
        }
      };

      startListening();
    }

    return () => {
      if (javascriptNode) javascriptNode.disconnect();
      if (microphone) microphone.disconnect();
      if (analyser) analyser.disconnect();
      if (audioContext) audioContext.close();
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [isClapEnabled, gameState, handleAction, clapThreshold]);

  useEffect(() => {
    let lastMotionTime = 0;
    const MOTION_COOLDOWN = 1000;

    const handleMotion = (event: DeviceMotionEvent) => {
      if (!isMotionEnabled || gameState !== GameState.PLAYING) return;

      const acc = event.accelerationIncludingGravity;
      if (!acc) return;

      // Calculate total acceleration magnitude or just vertical
      // For "jumping", we look at the vertical axis or total force
      const totalAcc = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
      
      if (totalAcc > motionThreshold) {
        const now = Date.now();
        if (now - lastMotionTime > MOTION_COOLDOWN) {
          lastMotionTime = now;
          handleAction();
        }
      }
    };

    if (isMotionEnabled && gameState === GameState.PLAYING) {
      // iOS requires permission for DeviceMotionEvent
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        (DeviceMotionEvent as any).requestPermission()
          .then((permissionState: string) => {
            if (permissionState === 'granted') {
              window.addEventListener('devicemotion', handleMotion);
            } else {
              setIsMotionEnabled(false);
            }
          })
          .catch(console.error);
      } else {
        window.addEventListener('devicemotion', handleMotion);
      }
    }

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [isMotionEnabled, gameState, handleAction, motionThreshold]);

  // Game Loop Logic
  const update = useCallback(() => {
    if (gameState !== GameState.PLAYING) return;

    setHook(prev => {
      let { angle, length, status, attachedObject } = prev;

      if (status === 'swinging') {
        angle += SWING_SPEED * swingDirection.current;
        if (angle > Math.PI * 0.8 || angle < Math.PI * 0.2) {
          swingDirection.current *= -1;
        }
      } else if (status === 'extending') {
        length += EXTEND_SPEED;
        
        // Check collision with objects
        const hookX = MINER_X + Math.cos(angle) * length;
        const hookY = MINER_Y + Math.sin(angle) * length;

        const hitObject = objects.find(obj => {
          const dist = Math.sqrt((obj.x - hookX) ** 2 + (obj.y - hookY) ** 2);
          return dist < obj.radius + 10;
        });

        if (hitObject) {
          status = 'retracting';
          attachedObject = hitObject;
          
          if (hitObject.type === 'tnt') {
            playSound('explosion');
            // Explosion logic
            const explosionRadius = 100;
            setObjects(objs => objs.filter(o => {
              if (o.id === hitObject.id) return false;
              const dist = Math.sqrt((o.x - hitObject.x) ** 2 + (o.y - hitObject.y) ** 2);
              return dist > explosionRadius;
            }));
            
            setExplosions(prevExps => [...prevExps, {
              id: Math.random().toString(36).substr(2, 9),
              x: hitObject.x,
              y: hitObject.y,
              radius: 10,
              maxRadius: explosionRadius,
              alpha: 1
            }]);

            attachedObject = null; // TNT disappears immediately
          } else {
            setObjects(objs => objs.filter(o => o.id !== hitObject.id));
          }
        } else if (length >= HOOK_MAX_LENGTH || hookX < 0 || hookX > CANVAS_WIDTH || hookY > CANVAS_HEIGHT) {
          status = 'retracting';
        }
      } else if (status === 'retracting') {
        const weightFactor = attachedObject ? attachedObject.weight : 0;
        const retractSpeed = Math.max(1, RETRACT_SPEED_BASE - weightFactor);
        length -= retractSpeed;

        if (length <= HOOK_MIN_LENGTH) {
          length = HOOK_MIN_LENGTH;
          status = 'swinging';
          if (attachedObject) {
            const val = attachedObject.value;
            if (typeof val === 'number') {
              setScore(s => s + val);
              if (attachedObject.type.includes('gold') || attachedObject.type === 'diamond') {
                playSound('coin');
              } else if (attachedObject.type.includes('rock')) {
                playSound('thud');
              }
            }
            attachedObject = null;
          }
        }
      }

      return { angle, length, status, attachedObject };
    });

    setExplosions(prev => {
      if (prev.length === 0) return prev;
      return prev.map(exp => ({
        ...exp,
        radius: exp.radius + 8,
        alpha: exp.alpha - 0.04
      })).filter(exp => exp.alpha > 0);
    });

  }, [gameState, objects, playSound]);

  // Timer
  useEffect(() => {
    if (gameState === GameState.PLAYING) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState]);

  // Check Win/Loss
  useEffect(() => {
    if (gameState === GameState.PLAYING && timeLeft === 0) {
      const currentLevel = LEVELS[Math.min(level, LEVELS.length - 1)];
      if (score >= currentLevel.target) {
        setGameState(GameState.LEVEL_COMPLETE);
        playSound('success');
      } else {
        setGameState(GameState.GAME_OVER);
        playSound('fail');
      }
    }
  }, [timeLeft, score, level, gameState, playSound]);

  // Draw Loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Sky
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, CANVAS_WIDTH, MINER_Y + 20);

    // Draw Ground
    const groundGradient = ctx.createLinearGradient(0, MINER_Y + 20, 0, CANVAS_HEIGHT);
    groundGradient.addColorStop(0, '#8B4513');
    groundGradient.addColorStop(1, '#4B2506');
    ctx.fillStyle = groundGradient;
    ctx.fillRect(0, MINER_Y + 20, CANVAS_WIDTH, CANVAS_HEIGHT - (MINER_Y + 20));

    // Draw Miner
    const minerImg = imagesRef.current['miner'];
    if (minerImg && minerImg.complete && minerImg.naturalWidth !== 0) {
      ctx.drawImage(minerImg, MINER_X - 36, MINER_Y - 52, 72, 72);
    } else {
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(MINER_X, MINER_Y - 20, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(MINER_X - 15, MINER_Y - 10, 30, 30);
    }

    // Draw Objects
    objects.forEach(obj => {
      const config = OBJECT_TYPES[obj.type];
      if (!config) return;

      const img = imagesRef.current[obj.type];
      if (img && img.complete && img.naturalWidth !== 0) {
        ctx.drawImage(img, obj.x - obj.radius, obj.y - obj.radius, obj.radius * 2, obj.radius * 2);
      } else {
        ctx.fillStyle = config.color;
        ctx.beginPath();
        ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Add some texture/shine
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(obj.x - obj.radius/3, obj.y - obj.radius/3, obj.radius/3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Draw Hook Line
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(MINER_X, MINER_Y);
    const hookX = MINER_X + Math.cos(hook.angle) * hook.length;
    const hookY = MINER_Y + Math.sin(hook.angle) * hook.length;
    ctx.lineTo(hookX, hookY);
    ctx.stroke();

    // Draw Hook Head
    ctx.save();
    ctx.translate(hookX, hookY);
    ctx.rotate(hook.angle + Math.PI / 2);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 10, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
    ctx.restore();

    // Draw Attached Object
    if (hook.attachedObject) {
      const obj = hook.attachedObject;
      const config = OBJECT_TYPES[obj.type];
      if (config) {
        const img = imagesRef.current[obj.type];
        if (img && img.complete && img.naturalWidth !== 0) {
          ctx.save();
          ctx.translate(hookX, hookY + obj.radius);
          ctx.drawImage(img, -obj.radius, -obj.radius, obj.radius * 2, obj.radius * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = config.color;
          ctx.beginPath();
          ctx.arc(hookX, hookY + obj.radius, obj.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw Explosions
    explosions.forEach(exp => {
      ctx.save();
      ctx.globalAlpha = exp.alpha;
      
      // Outer blast (orange/red)
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(exp.x, exp.y, exp.radius * 0.2, exp.x, exp.y, exp.radius);
      gradient.addColorStop(0, 'rgba(255, 255, 0, 0.8)');
      gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.6)');
      gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Inner core (white/yellow)
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      
      ctx.restore();
    });

    // update(); // Removed redundant call
  }, [objects, hook, explosions, update]);

  useEffect(() => {
    if (gameState === GameState.PLAYING) {
      let frameId: number;
      const loop = () => {
        update();
        frameId = requestAnimationFrame(loop);
      };
      frameId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(frameId);
    }
  }, [gameState, update]);

  useEffect(() => {
    let frameId: number;
    const renderLoop = () => {
      draw();
      frameId = requestAnimationFrame(renderLoop);
    };
    frameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(frameId);
  }, [draw]);

  return (
    <div className="min-h-screen bg-stone-900 flex flex-col items-center justify-center p-4 font-sans text-white overflow-hidden">
      {/* HUD */}
      <div className="w-full max-w-[800px] grid grid-cols-3 items-center mb-4 bg-stone-800/50 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
        {/* Left: Mic & Motion Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsClapEnabled(!isClapEnabled)}
              className={`flex flex-col items-center justify-center p-1.5 min-w-[48px] rounded-xl transition-all border ${isClapEnabled ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' : 'bg-stone-700/50 border-white/5 text-stone-400'}`}
              title={isClapEnabled ? "Clap to drop is ON" : "Clap to drop is OFF"}
            >
              {isClapEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              <span className="text-[7px] uppercase mt-0.5 font-bold">Clap</span>
            </button>
            
            {isClapEnabled && (
              <div className="flex flex-col gap-0.5 w-16">
                <input 
                  type="range" 
                  min="0.01" 
                  max="0.5" 
                  step="0.01"
                  value={clapThreshold}
                  onChange={(e) => setClapThreshold(parseFloat(e.target.value))}
                  className="w-full h-1 bg-stone-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  style={{ direction: 'rtl' }}
                />
                <span className="text-[7px] font-mono text-yellow-500 text-center">{(1 - clapThreshold).toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 border-l border-white/10 pl-2">
            <button 
              onClick={() => setIsMotionEnabled(!isMotionEnabled)}
              className={`flex flex-col items-center justify-center p-1.5 min-w-[48px] rounded-xl transition-all border ${isMotionEnabled ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-stone-700/50 border-white/5 text-stone-400'}`}
              title={isMotionEnabled ? "Motion sensor is ON" : "Motion sensor is OFF"}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="text-[7px] uppercase mt-0.5 font-bold">Jump</span>
            </button>

            {isMotionEnabled && (
              <div className="flex flex-col gap-0.5 w-16">
                <input 
                  type="range" 
                  min="10" 
                  max="40" 
                  step="1"
                  value={motionThreshold}
                  onChange={(e) => setMotionThreshold(parseFloat(e.target.value))}
                  className="w-full h-1 bg-stone-700 rounded-lg appearance-none cursor-pointer accent-blue-400"
                />
                <span className="text-[7px] font-mono text-blue-400 text-center">{motionThreshold}</span>
              </div>
            )}
          </div>
        </div>

        {/* Center: Score & Target */}
        <div className="flex items-center justify-center gap-8">
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Score</span>
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="text-2xl font-black text-white tabular-nums">{score}</span>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Target</span>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-500" />
              <span className="text-2xl font-black text-white tabular-nums">
                {LEVELS[Math.min(level, LEVELS.length - 1)].target}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Time */}
        <div className="flex flex-col items-end relative">
          <AnimatePresence>
            {showTimeSettings && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-full right-0 mb-2 p-2 bg-stone-800 border border-white/10 rounded-xl shadow-2xl z-50 flex gap-1"
              >
                {[30, 60, 90, 120].map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setGameTimeSetting(t);
                      if (gameState !== GameState.PLAYING) setTimeLeft(t);
                      setShowTimeSettings(false);
                    }}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${gameTimeSetting === t ? 'bg-blue-500 text-white shadow-sm' : 'bg-stone-700/50 text-stone-400 hover:text-stone-200'}`}
                  >
                    {t}s
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={() => setShowTimeSettings(!showTimeSettings)}
            className={`flex flex-col items-end transition-all p-1 rounded-xl hover:bg-white/5 ${showTimeSettings ? 'bg-white/5' : ''}`}
          >
            <span className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-1">Time</span>
            <div className="flex items-center gap-2">
              <Clock className={`w-5 h-5 ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-blue-400'}`} />
              <span className={`text-3xl font-black tabular-nums ${timeLeft < 10 ? 'text-red-500' : 'text-white'}`}>
                {timeLeft}s
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Game Canvas Container */}
      <div 
        className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-stone-800 cursor-crosshair"
        onClick={handleAction}
      >
        <canvas 
          ref={canvasRef} 
          width={CANVAS_WIDTH} 
          height={CANVAS_HEIGHT}
          className="bg-stone-800"
        />

        {/* Overlays */}
        <AnimatePresence>
          {gameState === GameState.START && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-8 text-center"
            >
              <motion.h1 
                initial={{ y: -20 }}
                animate={{ y: 0 }}
                className="text-6xl font-black mb-2 text-yellow-500 tracking-tighter uppercase italic"
              >
                Gold Miner
              </motion.h1>
              <p className="text-stone-400 mb-8 max-w-md">
                Hook as much gold as you can! Avoid heavy rocks and reach the target score before time runs out.
              </p>
              <button 
                onClick={startGame}
                className="group relative px-8 py-4 bg-yellow-500 text-black font-bold rounded-full hover:bg-yellow-400 transition-all flex items-center gap-2 overflow-hidden"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>START ADVENTURE</span>
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
              </button>
              <div className="mt-8 text-xs text-stone-500 uppercase tracking-widest">
                Press SPACE or CLICK to drop the hook
              </div>
            </motion.div>
          )}

          {gameState === GameState.LEVEL_COMPLETE && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-emerald-900/90 flex flex-col items-center justify-center p-8 text-center"
            >
              <Trophy className="w-20 h-20 text-yellow-400 mb-4" />
              <h2 className="text-5xl font-black mb-2 text-white uppercase italic">Level Clear!</h2>
              <p className="text-emerald-100 mb-8">
                You've reached the target! Ready for the next challenge?
              </p>
              <button 
                onClick={nextLevel}
                className="px-8 py-4 bg-white text-emerald-900 font-bold rounded-full hover:bg-emerald-50 transition-all flex items-center gap-2"
              >
                <span>NEXT LEVEL</span>
              </button>
            </motion.div>
          )}

          {gameState === GameState.GAME_OVER && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-red-900/90 flex flex-col items-center justify-center p-8 text-center"
            >
              <RotateCcw className="w-20 h-20 text-white mb-4" />
              <h2 className="text-5xl font-black mb-2 text-white uppercase italic">Game Over</h2>
              <p className="text-red-100 mb-8">
                You didn't reach the target score of {LEVELS[Math.min(level, LEVELS.length - 1)].target}.
              </p>
              <div className="text-3xl font-bold mb-8 text-yellow-400">Final Score: {score}</div>
              <button 
                onClick={startGame}
                className="px-8 py-4 bg-white text-red-900 font-bold rounded-full hover:bg-red-50 transition-all flex items-center gap-2"
              >
                <span>TRY AGAIN</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Info */}
      <div className="mt-6 text-stone-500 text-sm flex gap-8">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span>Gold: High Value</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-stone-600" />
          <span>Rock: Low Value / Heavy</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-300" />
          <span>Diamond: Very High Value</span>
        </div>
      </div>
    </div>
  );
}
