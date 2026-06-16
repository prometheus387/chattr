namespace Chattr.Api.Endpoints.Admin;

public static class AdminRoutes
{
    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        // All admin-dashboard endpoints require authentication —
        // the handler re-checks role membership (Moderator+)
        // before doing anything. We don't use [Authorize(Roles=)]
        // because the role lives in the DB, not in the JWT
        // claims, so the policy check would always deny.
        var group = app.MapGroup("/api/admin")
            .RequireAuthorization();

        group.MapGet("/users", AdminHandlers.ListUsers);
        group.MapPatch("/users/{userId:int}/role", AdminHandlers.UpdateUserRole);
        group.MapGet("/dashboard", AdminHandlers.GetDashboard);
    }
}
