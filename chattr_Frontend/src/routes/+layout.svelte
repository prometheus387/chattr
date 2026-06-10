<script lang="ts">
	import './layout.css';
	import './global.css';
	import favicon from '$lib/assets/favicon.svg';
	import Navigation from '../components/navigation.svelte';
	

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com">
<link href="https://fonts.googleapis.com/css2?family=Geo:ital@0;1&display=swap" rel="stylesheet">
</svelte:head>
<Navigation/>
{@render children()}
