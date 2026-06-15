namespace Chattr.Api.Endpoints.Dms;

public static class DmRoutes
{
    public static void MapDmEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/dms");

        group.MapGet("/", DmHandlers.GetMyDms)
             .RequireAuthorization();
        group.MapPost("/with/{otherUserId:int}", DmHandlers.OpenDmWith)
             .RequireAuthorization();
        group.MapGet("/{dmId:int}/messages", DmHandlers.GetDmMessages)
             .RequireAuthorization();
        group.MapPost("/{dmId:int}/messages", DmHandlers.PostDmMessage)
             .RequireAuthorization();
    }
}
