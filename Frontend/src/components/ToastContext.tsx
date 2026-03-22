import type React from 'react';
import { createContext, useCallback, useContext, useState } from 'react';
import type { ToastData } from './Toast';
import { ToastContainer } from './Toast';

interface ToastContextValue {
	showToast: (message: string, type?: ToastData['type']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const [toasts, setToasts] = useState<ToastData[]>([]);

	const removeToast = useCallback((id: string) => {
		setToasts(prev => prev.filter(t => t.id !== id));
	}, []);

	const showToast = useCallback(
		(message: string, type: ToastData['type'] = 'success') => {
			const id = `toast-${++toastId}`;
			setToasts(prev => [...prev, { id, message, type }]);
			setTimeout(() => removeToast(id), 5000);
		},
		[removeToast],
	);

	return (
		<ToastContext.Provider value={{ showToast }}>
			{children}
			<ToastContainer toasts={toasts} onClose={removeToast} />
		</ToastContext.Provider>
	);
}

export function useToast(): ToastContextValue {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error('useToast must be used within a ToastProvider');
	}
	return context;
}
