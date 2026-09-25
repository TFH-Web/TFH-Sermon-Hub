import clsx from 'clsx';
import type { PageInfo } from '$/types/pagination';
import Button from './Button';
import './Pagination.css';

export type { PageInfo };

export interface PaginationProps {
	pageInfo?: PageInfo;
	onPageChange: (newPage: number) => void;
	isLoading?: boolean;
	disabled?: boolean;
	className?: string;
}

export default function Pagination({
	pageInfo,
	onPageChange,
	isLoading = false,
	disabled = false,
	className,
}: PaginationProps) {
	const currentPage = pageInfo?.page ??  1;
	const totalPageCount = pageInfo?.totalPages ?? 0;

	const isPrevDisabled =
		disabled || isLoading || currentPage <= 1 || totalPageCount <= 0;
	const isNextDisabled =
		disabled ||
		isLoading ||
		currentPage >= totalPageCount ||
		totalPageCount <= 0;

	const displayedCurrentPage = totalPageCount === 0 ? 0 : currentPage;

	return (
		<nav
			className={clsx('Pagination', className)}
			aria-label="Pagination Navigation"
		>
			<Button
				variant="secondary"
				size="sm"
				type="button"
				className="Pagination-button Pagination-button--prev"
				aria-label="Previous page"
				disabled={isPrevDisabled}
				onClick={() => onPageChange(currentPage - 1)}
			>
				Previous
			</Button>

			<span className="Pagination-feedback" aria-live="polite">
				{`Page ${displayedCurrentPage} of ${totalPageCount}`}
			</span>

			<Button
				variant="secondary"
				size="sm"
				type="button"
				className="Pagination-button Pagination-button--next"
				aria-label="Next page"
				disabled={isNextDisabled}
				onClick={() => onPageChange(currentPage + 1)}
			>
				Next
			</Button>
		</nav>
	);
}
