using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// 1. Connection String aus deiner appsettings.Development.json laden
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");

// 2. Den DbContext im System registrieren und sagen, dass er PostgreSQL nutzen soll
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

// =========================================================================
// AUTOMATISCHE MIGRATION BEIM START (Ersetzt das zickige Terminal-Tool auf Arch)
// =========================================================================
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<AppDbContext>();
        // EF Core prüft die DB und erstellt vollautomatisch alle Tabellen
        await context.Database.MigrateAsync();
        Console.WriteLine("--> PostgreSQL Datenbank wurde erfolgreich migriert, Akh!");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"--> Fehler bei der Migration: {ex.Message}");
    }
}

app.Run();

// Das ist das Standard-Wetter-Beispiel von Microsoft, das kannst du später kicken
record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}