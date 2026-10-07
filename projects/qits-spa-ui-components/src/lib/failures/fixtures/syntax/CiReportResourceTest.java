package eu.wohlben.qits.ci.api;

import static io.restassured.RestAssured.given;

/*
 * A block comment that spans
 * three lines.
 */
@QuarkusTest
@TestHTTPEndpoint(value = CiReportResource.class, path = "/runs")
class CiReportResourceTest {

  private static final long LIMIT = 0x7FFF_FFFFL;
  private final char quote = '\'';

  @Test
  void refusesAnotherRunsToken() {
    String body = """
        {"kind": "test-results", "version": 1}
        """;
    int status = given().body(body).post("/reports").statusCode(); // the door
    assertEquals(403, status, "another run's token is refused");
    double ratio = 1.5e3d;
  }
}
