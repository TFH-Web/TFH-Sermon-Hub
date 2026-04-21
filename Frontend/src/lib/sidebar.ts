import { create } from 'zustand';

interface SidebarState {
	show: boolean;
	path: string;

	set: (newState: boolean) => void;
	onNavigate: (newPath: string) => void;
}

export const useSidebar = create<SidebarState>(set => ({
	show: false,
	path: window.location.pathname,

	set: newState => set(() => ({ show: newState })),
	onNavigate: newPath =>
		set(state => ({
		show: state.show && newPath === state.path,
		path: newPath,
	})),
}));
