<script lang="ts">
    import "../routes/global.css";
    import "./navigation.css";
    import { onMount } from 'svelte';
    import Base from "./navigation";
    const navigationLinks = Base.navigationLinks;

    onMount(() => {
        console.log('Navigation component mounted');
    });
</script>
<div class="w-full max-w-full overflow-x-hidden flex justify-between items-center py-2 px-3 text-white fixed top-0 left-0">
    <h1 class="nv-title geo-regular">{Base.title}</h1>
    <div class="flex items-center justify-center gap-3">
        {#each navigationLinks as navLink (navLink.name)}
            <a class="nv-link geo-regular" href={navLink.value} aria-label={navLink.name}>{navLink.name}</a>
        {/each}
    </div>
    <div class="flex items-center justify-center gap-3">
        <button class="nv-button nv-button-primary geo-regular">Sign In</button>
        <button class="nv-button nv-button-danger geo-regular">Sign Out</button>
        <button class="nv-button nv-button-primary geo-regular">Register</button>
    </div>
</div>