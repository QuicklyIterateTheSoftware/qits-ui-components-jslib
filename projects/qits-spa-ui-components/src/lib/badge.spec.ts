import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { QitsBadge } from './badge';

describe('QitsBadge', () => {
  function render(label: string): ComponentFixture<QitsBadge> {
    const fixture = TestBed.createComponent(QitsBadge);
    fixture.componentRef.setInput('label', label);
    fixture.detectChanges();
    return fixture;
  }

  function span(fixture: ComponentFixture<QitsBadge>): HTMLSpanElement {
    return fixture.nativeElement.querySelector('span') as HTMLSpanElement;
  }

  // Angular's class binding does not promise an order, only a set.
  function classes(element: Element): string[] {
    return [...element.classList].sort();
  }

  it('renders the label, neutral by default', () => {
    const fixture = render('QUEUED');
    expect(span(fixture).textContent).toBe('QUEUED');
    expect(classes(span(fixture))).toEqual(['qits-badge', 'qits-badge-neutral']);
  });

  it('carries the tone as a class, not as a colour the caller picked', () => {
    const fixture = render('SUCCESS');
    for (const tone of ['info', 'success', 'warning', 'danger', 'highlight'] as const) {
      fixture.componentRef.setInput('tone', tone);
      fixture.detectChanges();
      expect(classes(span(fixture))).toEqual(['qits-badge', `qits-badge-${tone}`]);
      expect(span(fixture).getAttribute('style')).toBeNull();
    }
  });

  it('follows the label through a change', () => {
    const fixture = render('RUNNING');
    fixture.componentRef.setInput('label', 'FAILED');
    fixture.detectChanges();
    expect(span(fixture).textContent).toBe('FAILED');
  });
});
