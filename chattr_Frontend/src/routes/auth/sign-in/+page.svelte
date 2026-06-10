<script lang="ts">
    import "../../global.css";
    import "./sign-in.css";
</script>

<div class="w-full max-h-fit h-screen flex justify-center items-center">
    <div class="si-form w-full">
        <div class="si-form-item">
            <label class="si-form-label geo-regular" for="username">Username</label>
            <input class="si-input geo-regular" name="username" placeholder="YourUsername67" type="text" />
        </div>
        <div class="si-form-item">
            <label class="si-form-label geo-regular" for="password">Password</label>
            <input class="si-input geo-regular" name="password" type="password" />
        </div>
        <div class="si-form-item">
            <button class="si-button geo-regular">Sign In</button>
        </div>
    </div>
</div>