import { Routes } from '@angular/router';
import { MainComponent } from './core/pages/main/main.component';

export const routes: Routes = [
    { 
        path: "", 
        component: MainComponent,
        pathMatch: 'full'
    }
];
