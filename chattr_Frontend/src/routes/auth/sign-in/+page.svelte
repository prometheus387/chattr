<script lang="ts">
    import "../../global.css";
    import "./sign-in.css";

    import { goto } from '$app/navigation';
	import { resolve } from "$app/paths";

    let username = $state("");
    let password = $state("");
    let errorMessage = $state("");
    let loading = $state(false);

    async function handleSignIn() {
        if (!username || !password) {
            errorMessage = "Please fill in all of your credentials!";
            return;
        }

        loading = true;
        errorMessage = "";
        
        const res = await fetch("/api/auth/sign-in", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username, password })
        });

        const result = await res.json();
        console.log(result.message)
        loading = false;

        if (res.ok && result.success) {
            goto(resolve("/"));
        }else {
            errorMessage = result.message || 'Something went wrong here...';
            errorMessage = errorMessage;
        }
    }
</script>

<div class="w-full max-h-fit h-screen flex justify-center items-center">
    <div class="si-form w-full">
        {#if errorMessage.length > 0}
            <h1>{errorMessage}</h1>
        {/if}
        <div class="si-form-item">
            <label class="si-form-label geo-regular" for="username">Username</label>
            <input bind:value={username} class="si-input geo-regular" name="username" placeholder="YourUsername67" type="text" />
        </div>
        <div class="si-form-item">
            <label class="si-form-label geo-regular" for="password">Password</label>
            <input bind:value={password} class="si-input geo-regular" name="password" type="password" />
        </div>
        <div class="si-form-item">
            <button 
                onclick={handleSignIn}
                disabled={loading}
                class="si-button geo-regular">
                { loading ? "Signing in..." : "Sign In" }
            </button>
        </div>
    </div>
</div>