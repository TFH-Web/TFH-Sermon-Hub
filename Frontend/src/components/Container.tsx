import './Container.css';
import clsx from 'clsx';

export interface ContainerProps {
	className: string;
}

export default function Container({
	className,
	children,
}: React.PropsWithChildren<ContainerProps>) {
	return <div className={clsx('Container', className)}>{children}</div>;
}
