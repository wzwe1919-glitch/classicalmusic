"use client";

import { useEffect, useRef, useState } from "react";

export default function Snowfall() {
  const canvasRef = useRef(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    setEnabled(!coarse && !reduced);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let animationFrame;
    const flakes = [];
    const amount = 90;
    let running = true;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const createFlakes = () => {
      flakes.length = 0;
      for (let i = 0; i < amount; i += 1) {
        flakes.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 2.2 + 0.5,
          speedY: Math.random() * 0.8 + 0.3,
          speedX: (Math.random() - 0.5) * 0.4
        });
      }
    };

    const draw = () => {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(255,255,255,0.7)";

      flakes.forEach((flake) => {
        flake.y += flake.speedY;
        flake.x += flake.speedX;
        if (flake.y > canvas.height + 4) {
          flake.y = -10;
          flake.x = Math.random() * canvas.width;
        }
        if (flake.x > canvas.width + 5) flake.x = -5;
        if (flake.x < -5) flake.x = canvas.width + 5;

        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrame = requestAnimationFrame(draw);
    };

    resize();
    createFlakes();
    draw();
    window.addEventListener("resize", resize);

    const onVisibility = () => {
      running = document.visibilityState === "visible";
      if (running) draw();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(animationFrame);
    };
  }, [enabled]);

  if (!enabled) return null;
  return <canvas ref={canvasRef} className="snowfall" aria-hidden="true" />;
}
