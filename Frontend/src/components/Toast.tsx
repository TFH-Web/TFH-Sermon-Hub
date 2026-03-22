import './Toast.css';
import clsx from 'clsx';

export interface ToastData {
	id: string;
	message: string;
	type: 'success' | 'error' | 'warning' | 'info';
}

interface ToastProps extends ToastData {
	onClose: (id: string) => void;
}

export function Toast({ id, message, type, onClose }: ToastProps) {
	return (
		<div className={clsx('Toast', `Toast--${type}`)}>
			<span className="Toast-message">{message}</span>
			<button
				type="button"
				className="Toast-close"
				onClick={() => onClose(id)}
				aria-label="Close"
			>
				&times;
			</button>
		</div>
	);
}

export function ToastContainer({
	toasts,
	onClose,
}: {
	toasts: ToastData[];
	onClose: (id: string) => void;
}) {
	if (toasts.length === 0) return null;

	return (
		<div className="ToastContainer">
			{toasts.map(toast => (
				<Toast key={toast.id} {...toast} onClose={onClose} />
			))}
		</div>
	);
}
