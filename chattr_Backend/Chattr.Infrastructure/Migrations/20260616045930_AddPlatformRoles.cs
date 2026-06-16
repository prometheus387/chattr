using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chattr.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ---- Step 1: add column as nullable -----------------------------
            // We need to backfill before the NOT NULL constraint can be
            // enforced. The default of "" (empty string) lets the
            // AddColumn succeed even though the underlying entity
            // declares the default as "User" — auto-gen just matches
            // the C# property's nullability, not its initial value.
            migrationBuilder.AddColumn<string>(
                name: "PlatformRole",
                table: "Users",
                type: "text",
                nullable: true);

            // ---- Step 2: backfill ------------------------------------------
            // Every existing user gets "User" by default. The very
            // first user (lowest Id) is auto-promoted to "Admin" —
            // this matches the spec: the first account ever created
            // IS the platform admin. For test data, that's kira2
            // (Id=1).
            migrationBuilder.Sql(@"
                UPDATE ""Users""
                SET ""PlatformRole"" = 'User';

                UPDATE ""Users""
                SET ""PlatformRole"" = 'Admin'
                WHERE ""Id"" = (SELECT MIN(""Id"") FROM ""Users"");
            ");

            // ---- Step 3: tighten to NOT NULL -------------------------------
            migrationBuilder.AlterColumn<string>(
                name: "PlatformRole",
                table: "Users",
                type: "text",
                nullable: false,
                defaultValue: "User",
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            // ---- Step 4: index for "list users by role" queries -----------
            // The admin dashboard filters / sorts by role. A btree
            // index on a low-cardinality column is cheap and makes
            // the per-role counts in the dashboard stats sub-ms.
            migrationBuilder.CreateIndex(
                name: "IX_Users_PlatformRole",
                table: "Users",
                column: "PlatformRole");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_PlatformRole",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PlatformRole",
                table: "Users");
        }
    }
}
