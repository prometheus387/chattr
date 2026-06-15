using System.Text;
using Chattr.Api.Endpoints;
using Chattr.Domain.Services;
using Chattr.Infrastructure.Data;
using Chattr.Infrastructure.Options;
using Chattr.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// --- Configuration -----------------------------------------------------------
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");

// Bind and validate the Jwt section up-front so we fail fast on a missing
// or weak signing key, rather than discovering it at the first request.
builder.Services
    .AddOptions<JwtOptions>()
    .Bind(builder.Configuration.GetSection(JwtOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

// --- Data --------------------------------------------------------------------
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

// --- App services ------------------------------------------------------------
builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();

// --- AuthN / AuthZ -----------------------------------------------------------
var jwt = builder.Configuration
    .GetSection(JwtOptions.SectionName)
    .Get<JwtOptions>() ?? new JwtOptions();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false; // keep "sub" as "sub", not as name-claim
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Audience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwt.SigningKey)),
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });

builder.Services.AddAuthorization();

// --- CORS (frontend hits us from the browser) --------------------------------
var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? Array.Empty<string>();

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
{
    if (allowedOrigins.Length == 0)
    {
        // Dev fallback — only allow the local Next.js origin.
        p.WithOrigins("http://localhost:3000", "https://localhost:3000")
         .AllowAnyHeader()
         .AllowAnyMethod()
         .AllowCredentials();
    }
    else
    {
        p.WithOrigins(allowedOrigins)
         .AllowAnyHeader()
         .AllowAnyMethod()
         .AllowCredentials();
    }
}));

builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.RegisterAllEndpoints();

using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<AppDbContext>();
        await context.Database.MigrateAsync();
        Console.WriteLine("--> PostgreSQL Datenbank wurde erfolgreich migriert, Akh!");

        // Dev seed: make sure every existing user has at least one guild
        // (a "General" server with a #welcome channel) so the client
        // page has something to render.
        await SeedDevDataAsync(context);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"--> Fehler bei der Migration: {ex.Message}");
    }
}

static async Task SeedDevDataAsync(AppDbContext context)
{
    var users = context.Users.ToList();
    if (users.Count == 0) return;

    foreach (var user in users)
    {
        var alreadyHas = context.GuildMembers.Any(m => m.UserId == user.Id);
        if (alreadyHas) continue;

        var guild = new Chattr.Core.Entities.Guild
        {
            Name = "General",
            CreatedAt = DateTime.UtcNow,
        };
        context.Guilds.Add(guild);
        await context.SaveChangesAsync();

        context.GuildMembers.Add(new Chattr.Core.Entities.GuildMember
        {
            UserId = user.Id,
            GuildId = guild.Id,
            IsOwner = true,
            JoinedAt = DateTime.UtcNow,
        });

        context.Channels.AddRange(
            new Chattr.Core.Entities.Channel
            {
                GuildId = guild.Id,
                Name = "welcome",
                Category = "Text Channels",
                Kind = Chattr.Core.Entities.ChannelKind.Text,
                Position = 0,
            },
            new Chattr.Core.Entities.Channel
            {
                GuildId = guild.Id,
                Name = "general",
                Category = "Text Channels",
                Kind = Chattr.Core.Entities.ChannelKind.Text,
                Position = 1,
            },
            new Chattr.Core.Entities.Channel
            {
                GuildId = guild.Id,
                Name = "off-topic",
                Category = "Text Channels",
                Kind = Chattr.Core.Entities.ChannelKind.Text,
                Position = 2,
            },
            new Chattr.Core.Entities.Channel
            {
                GuildId = guild.Id,
                Name = "announcements",
                Category = "Info",
                Kind = Chattr.Core.Entities.ChannelKind.Text,
                Position = 0,
            },
            new Chattr.Core.Entities.Channel
            {
                GuildId = guild.Id,
                Name = "rules",
                Category = "Info",
                Kind = Chattr.Core.Entities.ChannelKind.Text,
                Position = 1,
            });

        await context.SaveChangesAsync();
        Console.WriteLine($"--> Seed: created guild 'General' (id={guild.Id}) for user '{user.Username}'.");
    }
}

app.Run();
