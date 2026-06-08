using Chattr.Api.Endpoints;
using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.RegisterAllEndpoints();

using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<AppDbContext>();
        await context.Database.MigrateAsync();
        Console.WriteLine("--> PostgreSQL Datenbank wurde erfolgreich migriert, Akh!");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"--> Fehler bei der Migration: {ex.Message}");
    }
}

app.Run();
