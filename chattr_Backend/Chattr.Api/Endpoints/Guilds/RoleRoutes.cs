namespace Chattr.Api.Endpoints.Guilds;

public static class RoleRoutes
{
    public static void MapRoleEndpoints(this IEndpointRouteBuilder app)
    {
        // Guild-scoped role management. Each handler re-checks
        // permissions internally — auth gate just ensures the
        // caller has a valid token.
        var group = app.MapGroup("/api/guilds/{guildId:int}/roles")
            .RequireAuthorization();

        // List (any member can read) + create (manage-roles).
        group.MapGet("/", RoleHandlers.ListRoles);
        group.MapPost("/", RoleHandlers.CreateRole);

        // Per-role ops: update name/color/position/displaySeparately
        // /permissions, delete. The CanManageRole check inside the
        // handler enforces that the actor's own role sits above the
        // target in the hierarchy (owner can do anything).
        group.MapPatch("/{roleId:int}", RoleHandlers.UpdateRole);
        group.MapDelete("/{roleId:int}", RoleHandlers.DeleteRole);

        // Member-role assignment. Same gate as UpdateRole: the
        // actor must be able to manage the role being assigned.
        // Owners always pass.
        app.MapPatch(
                "/api/guilds/{guildId:int}/members/{userId:int}/role",
                RoleHandlers.AssignMemberRole)
           .RequireAuthorization();
    }
}
