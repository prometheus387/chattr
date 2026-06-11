import { NavItem } from '../models/nav-item';

export const NAVBAR_LINKS: NavItem[] = [
    {
        label: "Client",
        route: "/client",
    },
    {
        label: "Support",
        children: [
            {
                label: "Ticket Support",
                route: "/support/tickets"
            },
            {
                label: "Help Page",
                route: "/support/help"
            }
        ]
    }
]