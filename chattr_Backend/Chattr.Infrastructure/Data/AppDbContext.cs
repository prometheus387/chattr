using Chattr.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users { get; set; }
    public DbSet<PlatformInvite> PlatformInvites { get; set; }
    public DbSet<SystemSetting> SystemSettings { get; set; }


    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>().HasIndex(u => u.Username).IsUnique();
        modelBuilder.Entity<User>().HasIndex(u => u.Id).IsUnique();
        modelBuilder.Entity<PlatformInvite>().HasIndex(p => p.Id).IsUnique();
        modelBuilder.Entity<PlatformInvite>().HasIndex(p => p.Code).IsUnique();
        modelBuilder.Entity<SystemSetting>().HasIndex(s => s.Key).IsUnique();
    }
}