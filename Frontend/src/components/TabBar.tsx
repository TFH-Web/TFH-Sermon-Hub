import './TabBar.css';
import clsx from 'clsx';

export interface TabBarProps {
	tabs: string[];
	activeTab: string;
	onTabChange: (tab: string) => void;
}

export default function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
	return (
		<div className="TabBar">
			{tabs.map(tab => (
				<button
					key={tab}
					type="button"
					className={clsx(
						'TabBar-tab',
						tab === activeTab && 'TabBar-tab--active',
					)}
					onClick={() => onTabChange(tab)}
				>
					{tab}
				</button>
			))}
		</div>
	);
}
