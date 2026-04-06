// import { useState } from 'react';
import SpeakerCard from './components/SpeakerCard';
import './Speakers.css';
import MainLayout from '$/components/MainLayout';

// temporary dummy data just for testing displaying speakers
const speakers = [
	{
		name: 'Dave Patterson',
		role: 'Lead Pastor',
		sermoncount: '1847',
		color: 'green',
	},
	{
		name: 'Guest Speakers',
		role: 'Various',
		sermoncount: '342',
		color: 'blue',
	},
	{
		name:'Worship Team',
		role: 'Team',
		sermoncount: '248',
		color: 'orange ',
	},

	// {	name: 'Dave Patterson',
	// 	role: 'Lead Pastor',
	// 	sermoncount: '1847',
	// 	color: 'green',
	// },
	// {
	// 	name: 'Guest Speakers',
	// 	role: 'Various',
	// 	sermoncount: '342',
	// 	color: 'blue',
	// },
	// {
	// 	name:'Worship Team',
	// 	role: 'Team',
	// 	sermoncount: '248',
	// 	color: 'orange ',
	// },
	// {
	// 	name: 'Dave Patterson',
	// 	role: 'Lead Pastor',
	// 	sermoncount: '1847',
	// 	color: 'green',
	// },
	// {
	// 	name: 'Guest Speakers',
	// 	role: 'Various',
	// 	sermoncount: '342',
	// 	color: 'blue',
	// },
	// {
	// 	name:'Worship Team',
	// 	role: 'Team',
	// 	sermoncount: '248',
	// 	color: 'orange ',
	// },
	// {
	// 	name: 'Dave Patterson',
	// 	role: 'Lead Pastor',
	// 	sermoncount: '1847',
	// 	color: 'green',
	// },
	// {
	// 	name: 'Guest Speakers',
	// 	role: 'Various',
	// 	sermoncount: '342',
	// 	color: 'blue',
	// },
	// {
	// 	name:'Worship Team',
	// 	role: 'Team',
	// 	sermoncount: '248',
	// 	color: 'orange ',
	// },
	// {
	// 	name: 'Dave Patterson',
	// 	role: 'Lead Pastor',
	// 	sermoncount: '1847',
	// 	color: 'green',
	// },
	// {
	// 	name: 'Guest Speakers',
	// 	role: 'Various',
	// 	sermoncount: '342',
	// 	color: 'blue',
	// },
	// {
	// 	name:'Worship Team',
	// 	role: 'Team',
	// 	sermoncount: '248',
	// 	color: 'orange ',
	// },
]


//displays 3-wide grid of SpeakerCard components from given list of speakers
export default function Speakers() {
	return (
		<MainLayout title="Speakers">
			{/* <h2>Speakers</h2> */}
			<div 
				className="speaker-grid"
			>
				{speakers.map(speaker => (<SpeakerCard key={speaker.name} speaker = {speaker} />))}
			</div>

		</MainLayout>
	);
}
