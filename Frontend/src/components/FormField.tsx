import type React from 'react';
import './FormField.css';
import clsx from 'clsx';

export interface FormFieldProps {
	label: string;
	hint?: string;
	error?: string;
	children: React.ReactNode;
	className?: string;
}

export interface FormRowProps {
	children: React.ReactNode;
	className?: string;
}

export function FormField({
	label,
	hint,
	error,
	children,
	className,
}: FormFieldProps) {
	return (
		<div className={clsx('FormField', error && 'FormField--error', className)}>
			{/* biome-ignore lint/a11y/noLabelWithoutControl: children provide the form control */}
			<label className="FormField-label">{label}</label>
			{children}
			{error && <p className="FormField-error">{error}</p>}
			{!error && hint && <p className="FormField-hint">{hint}</p>}
		</div>
	);
}

export function FormRow({ children, className }: FormRowProps) {
	return <div className={clsx('FormRow', className)}>{children}</div>;
}
