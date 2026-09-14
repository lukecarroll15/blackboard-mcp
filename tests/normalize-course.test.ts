import { beforeEach, describe, expect, it } from 'vitest';
import { findCourse, listCourses, moduleFolderName, normalizeCourse } from '../src/blackboard/courses.js';
import { BlackboardError } from '../src/blackboard/errors.js';
import { globalCache } from '../src/blackboard/cache.js';
import { COURSES, ENROLLMENTS, FakeHttp, USER_ME } from './helpers/fake-http.js';
import { paths } from '../src/storage/session-store.js';

beforeEach(() => {
  globalCache.clear();
});

describe('normalizeCourse', () => {
  it('maps a raw course + enrollment to the internal Course shape', () => {
    const raw = COURSES.results[0];
    const enrollment = ENROLLMENTS.results[0];
    const course = normalizeCourse(raw, enrollment);
    expect(course).toMatchObject({
      id: '_26184_1',
      name: 'CIS 473 - Introduction to Artificial Intelligence',
      courseCode: 'CIS.473.M001.FALL2026',
      role: 'Student',
      available: true,
      startDate: '2026-08-24T04:00:00.000Z',
      endDate: '2026-12-11T05:00:00.000Z',
    });
    expect(course.url).toContain('/ultra/courses/_26184_1/outline');
  });

  it('marks a course unavailable when either course or enrollment is unavailable', () => {
    const hidden = normalizeCourse(COURSES.results[1], ENROLLMENTS.results[1]);
    expect(hidden.available).toBe(false);
    const hiddenByEnrollment = normalizeCourse(COURSES.results[0], {
      availability: { available: 'No' },
    });
    expect(hiddenByEnrollment.available).toBe(false);
  });

  it('throws on malformed course objects', () => {
    expect(() => normalizeCourse({ id: '_1_1' })).toThrow(BlackboardError);
  });
});

describe('listCourses', () => {
  it('joins enrollments with the course listing and filters unavailable by default', async () => {
    const http = new FakeHttp();
    http.on(/\/users\/me$/, () => ({ json: USER_ME }));
    http.on(/\/users\/_777_1\/courses/, () => ({ json: ENROLLMENTS }));
    http.on(/\/courses\?limit=100$/, () => ({ json: COURSES }));

    const courses = await listCourses(http);
    expect(courses.map((c) => c.id)).toEqual(['_26184_1']);
    expect(courses[0].role).toBe('Student');
  });

  it('includes unavailable courses when requested', async () => {
    const http = new FakeHttp();
    http.on(/\/users\/me$/, () => ({ json: USER_ME }));
    http.on(/\/users\/_777_1\/courses/, () => ({ json: ENROLLMENTS }));
    http.on(/\/courses\?limit=100$/, () => ({ json: COURSES }));

    const courses = await listCourses(http, { includeUnavailable: true });
    expect(courses.map((c) => c.id).sort()).toEqual(['_26184_1', '_26185_1']);
  });

  it('falls back to the permission-filtered course listing when /users/me is unavailable', async () => {
    const http = new FakeHttp();
    http.on(/\/users\/me$/, () => ({ status: 404, json: { status: 404, message: 'not found' } }));
    http.on(/\/courses\?limit=1$/, () => ({ json: { results: [COURSES.results[0]] } }));
    http.on(/\/courses\?limit=100$/, () => ({ json: { results: COURSES.results } }));

    const courses = await listCourses(http);
    expect(courses.map((c) => c.id)).toEqual(['_26184_1']);
  });

  it('maps a 401 to BLACKBOARD_SESSION_EXPIRED', async () => {
    const http = new FakeHttp();
    http.on(/\/users\/me$/, () => ({ status: 401, json: { status: 401, message: 'unauthorized' } }));
    await expect(listCourses(http)).rejects.toMatchObject({ code: 'BLACKBOARD_SESSION_EXPIRED' });
  });

  it('finds courses by id and by course code', async () => {
    const http = new FakeHttp();
    http.on(/\/users\/me$/, () => ({ json: USER_ME }));
    http.on(/\/users\/_777_1\/courses/, () => ({ json: ENROLLMENTS }));
    http.on(/\/courses\?limit=100$/, () => ({ json: COURSES }));

    const byId = await findCourse(http, '_26184_1');
    expect(byId.id).toBe('_26184_1');
    const byCode = await findCourse(http, 'CIS.473.M001.FALL2026');
    expect(byCode.id).toBe('_26184_1');
    await expect(findCourse(http, '_999_1')).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' });
  });
});

describe('moduleFolderName', () => {
  it('title-cases the name, drops the ECTS suffix and the academic year', () => {
    expect(moduleFolderName({ id: '_1_1', name: 'INTERNATIONAL TRADE (10 ECTS)', courseCode: 'ECU44201-202627' })).toBe(
      'International Trade - ECU44201',
    );
    expect(moduleFolderName({ id: '_1_1', name: 'INTRODUCTION TO THE HISTORY OF THE MODERN MIDDLE EAST', courseCode: 'NMU11001-202425' })).toBe(
      'Introduction to the History of the Modern Middle East - NMU11001',
    );
  });

  it('falls back when the code or name is missing', () => {
    expect(moduleFolderName({ id: '_1_1', name: 'HUMAN FACTORS' })).toBe('Human Factors');
    expect(moduleFolderName({ id: '_1_1', name: '' })).toBe('_1_1');
  });
});

describe('downloads directory', () => {
  it('honours BB_DOWNLOADS_DIR without moving the session home', () => {
    const before = { dl: process.env.BB_DOWNLOADS_DIR, home: process.env.BLACKBOARD_MCP_HOME };
    process.env.BLACKBOARD_MCP_HOME = '/tmp/bb-home';
    process.env.BB_DOWNLOADS_DIR = '/tmp/bb-downloads';
    expect(paths.downloadsDir).toBe('/tmp/bb-downloads');
    expect(paths.profileDir).toBe('/tmp/bb-home/chrome-profile');
    process.env.BB_DOWNLOADS_DIR = '   ';
    expect(paths.downloadsDir).toBe('/tmp/bb-home/downloads');
    if (before.dl === undefined) delete process.env.BB_DOWNLOADS_DIR; else process.env.BB_DOWNLOADS_DIR = before.dl;
    if (before.home === undefined) delete process.env.BLACKBOARD_MCP_HOME; else process.env.BLACKBOARD_MCP_HOME = before.home;
  });
});
