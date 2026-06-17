namespace Chattr.Api.Endpoints.Auth;

/// <summary>
/// Mount point for the Phase-1 "Burn Account" handler.
/// Phase 3 actually wires it up — the handler's been
/// sitting in the codebase since Phase 1, but the
/// route was never registered. Now it is: a single
/// <c>DELETE /api/users/me</c> that hard-deletes the
/// calling user and all their data, irreversibly.
///
/// The frontend's <c>BurnAccountModal</c> orchestrates
/// the client-side cleanup (IndexedDB wipe, in-RAM
/// key-store purge) <em>before</em> calling this
/// endpoint — the order matters because the moment
/// this endpoint returns 204, the user is gone from
/// the server and the JWT is dead on the next
/// refresh; doing the local cleanup after would
/// leave the local copy of the private key sitting
/// in the browser until the next manual reload.
/// </summary>
public static class BurnAccountRoutes
{
    public static void MapBurnAccountEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapDelete(
                "/api/users/me",
                BurnAccountHandlers.BurnAccount)
            .RequireAuthorization();
    }
}
