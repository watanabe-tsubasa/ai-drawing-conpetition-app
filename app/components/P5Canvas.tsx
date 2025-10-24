import { useEffect, useRef } from "react";

declare global {
	interface Window {
		// biome-ignore lint/suspicious/noExplicitAny: p5.js library types - both parameters and return type
		p5?: new (sketch: (p: any) => void) => any;
	}
}

interface P5CanvasProps {
	sketchName: string;
	p5ScriptSrc?: string;
	className?: string;
}

export default function P5Canvas({
	sketchName,
	p5ScriptSrc = "https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js",
	className = "",
}: P5CanvasProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	// biome-ignore lint/suspicious/noExplicitAny: p5 instance type not available
	const instanceRef = useRef<any>(null);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const loadScript = (src: string): Promise<void> =>
			new Promise((resolve, reject) => {
				// すでに読み込み済みならスキップ
				if (document.querySelector(`script[src="${src}"]`)) return resolve();

				const s = document.createElement("script");
				s.src = src;
				s.defer = true;
				s.onload = () => resolve();
				s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
				document.body.appendChild(s);
			});

		const runSketch = async () => {
			try {
				// 1️⃣ p5.jsの読み込みを待つ
				await loadScript(p5ScriptSrc);

				// 2️⃣ p5が確実にwindow上に存在するまで待つ
				await new Promise<void>((resolve) => {
					const interval = setInterval(() => {
						if (window.p5) {
							clearInterval(interval);
							resolve();
						}
					}, 30);
				});

				// 3️⃣ スケッチスクリプトをロード（上書き防止のため固有ID付）
				const sketchSrc = `/sketches/${sketchName}.js`;
				if (!document.querySelector(`script[src="${sketchSrc}"]`)) {
					await loadScript(sketchSrc);
				}

				// 4️⃣ スケッチ関数を取得
				// biome-ignore lint/suspicious/noExplicitAny: dynamic sketch loading
				const sketchFn = (window as any)[sketchName];
				if (!sketchFn || !window.p5) {
					console.error(`sketch not found: ${sketchName}`);
					return;
				}

				// 既存インスタンス削除
				if (instanceRef.current) {
					instanceRef.current.remove();
					instanceRef.current = null;
				}

				// 5️⃣ 新しいp5インスタンス生成
				instanceRef.current = new window.p5(sketchFn);
			} catch (err) {
				console.error(`Error initializing p5 for ${sketchName}`, err);
			}
		};

		runSketch();

		return () => {
			// アンマウント時のクリーンアップ
			if (instanceRef.current) {
				instanceRef.current.remove();
				instanceRef.current = null;
			}
		};
	}, [sketchName, p5ScriptSrc]);

	return (
		<div
			ref={containerRef}
			id={`p5-canvas-${sketchName}`}
			className={`w-full h-full ${className}`}
		/>
	);
}
