import { useRef } from 'react';
import './FileUploadButton.css';
import Button from '$/components/Button';
import { useToast } from '$/components/ToastContext';

export function readFileAsText(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = e => resolve(e.target?.result as string);
		reader.onerror = () => reject(new Error('Failed to read file'));
		reader.readAsText(file);
	});
}

interface FileUploadButtonProps {
	onFileRead: (text: string) => void; // Callback to handle the file content once read
	className?: string;
	children?: React.ReactNode;
}

export default function FileUploadButton({
	onFileRead,
	className,
	children,
}: FileUploadButtonProps) {
	const { showToast } = useToast();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		try {
			const text = await readFileAsText(file);
			onFileRead(text);
		} catch {
			showToast('Failed to read file', 'error');
		}
	};

	return (
		<>
			<input
				ref={fileInputRef}
				type="file"
				accept=".txt"
				onChange={handleFileSelect}
				style={{ display: 'none' }}
			/>
			<Button
				variant="secondary"
				className={className}
				onClick={() => fileInputRef.current?.click()}
			>
				{children}
			</Button>
		</>
	);
}
