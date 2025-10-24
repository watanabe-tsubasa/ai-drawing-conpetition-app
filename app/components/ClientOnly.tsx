import { type ReactNode, useEffect, useState } from "react";

interface ClientOnlyProps {
	children: ReactNode;
}

export function ClientOnly({ children }: ClientOnlyProps) {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	return mounted ? children : null;
}
