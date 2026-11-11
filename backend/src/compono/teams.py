"""Teams, their members and invite links."""

from sqlalchemy import orm, select

from compono.models import Account, Team, TeamMember, TeamRole


def teams_of(database: orm.Session, account: Account) -> list[tuple[Team, TeamRole]]:
    """The account's teams."""
    # Select the rows of team and role for a supplied account
    # Sort by the date joined and the name
    rows = database.execute(
        select(Team, TeamMember.role)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(TeamMember.account_id == account.id)
        .order_by(TeamMember.joined_at, Team.name)
    )

    # Unpack and return as a list
    return [(team, role) for team, role in rows]
