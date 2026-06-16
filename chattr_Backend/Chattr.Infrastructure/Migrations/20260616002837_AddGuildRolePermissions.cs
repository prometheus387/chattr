using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Chattr.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGuildRolePermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Add the new columns nullable. Existing rows in GuildRoles
            //    and GuildMembers exist; we'll backfill them with a @everyone
            //    role and flip to NOT NULL once every row is populated.
            migrationBuilder.AddColumn<int>(
                name: "GuildId",
                table: "GuildRoles",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RoleId",
                table: "GuildMembers",
                type: "integer",
                nullable: true);

            // 2. Create the permissions table.
            migrationBuilder.CreateTable(
                name: "GuildRolePermissions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RoleId = table.Column<int>(type: "integer", nullable: false),
                    IsAdministrator = table.Column<bool>(type: "boolean", nullable: false),
                    CanDeleteMessages = table.Column<bool>(type: "boolean", nullable: false),
                    CanManageChannels = table.Column<bool>(type: "boolean", nullable: false),
                    BypassSlowmode = table.Column<bool>(type: "boolean", nullable: false),
                    CanBanMembers = table.Column<bool>(type: "boolean", nullable: false),
                    CanKickMembers = table.Column<bool>(type: "boolean", nullable: false),
                    CanDeafenMembers = table.Column<bool>(type: "boolean", nullable: false),
                    CanMuteMembers = table.Column<bool>(type: "boolean", nullable: false),
                    CanTimeoutMembers = table.Column<bool>(type: "boolean", nullable: false),
                    CanChangeOwnNickname = table.Column<bool>(type: "boolean", nullable: false),
                    CanChangeNickName = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuildRolePermissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GuildRolePermissions_GuildRoles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "GuildRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // 3. Indexes.
            migrationBuilder.CreateIndex(
                name: "IX_GuildRoles_GuildId_Name",
                table: "GuildRoles",
                columns: new[] { "GuildId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GuildMembers_RoleId",
                table: "GuildMembers",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_GuildRolePermissions_RoleId",
                table: "GuildRolePermissions",
                column: "RoleId",
                unique: true);

            // 4. FKs.
            migrationBuilder.AddForeignKey(
                name: "FK_GuildMembers_GuildRoles_RoleId",
                table: "GuildMembers",
                column: "RoleId",
                principalTable: "GuildRoles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_GuildRoles_Guilds_GuildId",
                table: "GuildRoles",
                column: "GuildId",
                principalTable: "Guilds",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            // 5. Backfill: every existing Guild gets a @everyone role with
            //    IsAdministrator=true, and every existing member of that
            //    Guild is assigned to it. Guilds without members still get
            //    the role so future joins have a default.
            migrationBuilder.Sql(@"
                INSERT INTO ""GuildRoles"" (""GuildId"", ""Name"", ""Color"")
                SELECT g.""Id"", '@everyone', '#99aab5'
                FROM ""Guilds"" g
                WHERE NOT EXISTS (
                    SELECT 1 FROM ""GuildRoles"" r
                    WHERE r.""GuildId"" = g.""Id"" AND r.""Name"" = '@everyone'
                );
            ");

            // Link each @everyone role to its permissions row.
            migrationBuilder.Sql(@"
                INSERT INTO ""GuildRolePermissions"" (""RoleId"", ""IsAdministrator"",
                    ""CanDeleteMessages"", ""CanManageChannels"", ""BypassSlowmode"",
                    ""CanBanMembers"", ""CanKickMembers"", ""CanDeafenMembers"",
                    ""CanMuteMembers"", ""CanTimeoutMembers"",
                    ""CanChangeOwnNickname"", ""CanChangeNickName"")
                SELECT r.""Id"", TRUE,
                    FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE
                FROM ""GuildRoles"" r
                WHERE r.""Name"" = '@everyone'
                  AND NOT EXISTS (
                    SELECT 1 FROM ""GuildRolePermissions"" p WHERE p.""RoleId"" = r.""Id""
                );
            ");

            // Assign every member to their guild's @everyone role.
            migrationBuilder.Sql(@"
                UPDATE ""GuildMembers"" m
                SET ""RoleId"" = r.""Id""
                FROM ""GuildRoles"" r
                WHERE r.""GuildId"" = m.""GuildId"" AND r.""Name"" = '@everyone';
            ");

            // 6. Now that every row is populated, flip the columns to NOT NULL.
            //    Guild 1 has no members, so its @everyone role exists but
            //    has no FK pressure from the member side. We still pin the
            //    columns NOT NULL because application code will never insert
            //    a member without a role from this point on.
            migrationBuilder.AlterColumn<int>(
                name: "GuildId",
                table: "GuildRoles",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "RoleId",
                table: "GuildMembers",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GuildMembers_GuildRoles_RoleId",
                table: "GuildMembers");

            migrationBuilder.DropForeignKey(
                name: "FK_GuildRoles_Guilds_GuildId",
                table: "GuildRoles");

            migrationBuilder.DropTable(
                name: "GuildRolePermissions");

            migrationBuilder.DropIndex(
                name: "IX_GuildRoles_GuildId_Name",
                table: "GuildRoles");

            migrationBuilder.DropIndex(
                name: "IX_GuildMembers_RoleId",
                table: "GuildMembers");

            migrationBuilder.DropColumn(
                name: "GuildId",
                table: "GuildRoles");

            migrationBuilder.DropColumn(
                name: "RoleId",
                table: "GuildMembers");
        }
    }
}
