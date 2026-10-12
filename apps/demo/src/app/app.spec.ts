import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('affiche la navigation vers les quatre pages', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const links = (fixture.nativeElement as HTMLElement).querySelectorAll('nav a');
    expect(links.length).toBe(4);
    expect(Array.from(links).map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/form',
      '/import',
      '/readonly',
    ]);
  });

  it('donne un titre de document à chaque page', () => {
    const pages = routes.filter((route) => route.path !== '**');
    expect(pages.map((route) => route.title)).toEqual([
      'Playground · Aster',
      'Reactive form · Aster',
      'Import Word · Aster',
      'Lecture seule · Aster',
    ]);
  });
});
